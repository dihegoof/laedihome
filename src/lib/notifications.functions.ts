import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://connector-gateway.lovable.dev/firebase_messaging";

export const sendDueAppointmentNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const now = new Date();
    const { data: settings } = await context.supabase.from("household_settings").select("notifications_enabled,reminder_minutes,reminder_hour").limit(1).maybeSingle();
    if (settings?.notifications_enabled === false) return { sent: 0 };
    const lead = settings?.reminder_minutes ?? 1440;
    const reminderHour = settings?.reminder_hour ?? 9;
    const horizon = new Date(now.getTime() + Math.max(48 * 60, lead + 24 * 60) * 60 * 1000);
    const { data: appointments, error } = await context.supabase
      .from("appointments")
      .select("id,title,scheduled_at,created_by,notification_sent_at")
      .eq("created_by", context.userId)
      .is("notification_sent_at", null)
      .gte("scheduled_at", now.toISOString())
      .lte("scheduled_at", horizon.toISOString());
    if (error || !appointments?.length) return { sent: 0 };

    const due = appointments.filter((appointment) => {
      const localDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(appointment.scheduled_at));
      const reminderDate = new Date(`${localDate}T${String(reminderHour).padStart(2, "0")}:00:00-03:00`);
      reminderDate.setUTCMinutes(reminderDate.getUTCMinutes() - lead);
      return now >= reminderDate;
    });
    if (!due.length) return { sent: 0 };
    const { data: devices } = await context.supabase.from("device_tokens").select("token").eq("user_id", context.userId).eq("enabled", true);
    if (!devices?.length) return { sent: 0 };

    const lovableKey = process.env['LOVABLE_API_KEY'];
    const connectionKey = process.env['FIREBASE_MESSAGING_API_KEY'];
    if (!lovableKey || !connectionKey) throw new Error("Notificações não configuradas");
    let sent = 0;
    for (const appointment of due) {
      let delivered = false;
      const when = new Date(appointment.scheduled_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
      for (const device of devices) {
        const response = await fetch(`${GATEWAY}/v1/projects/_/messages:send`, {
          method: "POST",
          headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": connectionKey, "Content-Type": "application/json" },
          body: JSON.stringify({ message: { token: device.token, notification: { title: "Compromisso chegando", body: `${appointment.title || "Compromisso"} · ${when}` }, data: { path: "/" } } }),
        });
        if (response.ok) {
          sent += 1;
          delivered = true;
        } else if (response.status === 400 || response.status === 404) {
          await context.supabase.from("device_tokens").delete().eq("token", device.token);
        }
      }
      if (delivered) {
        await context.supabase.from("appointments").update({ notification_sent_at: now.toISOString() }).eq("id", appointment.id);
      }
    }
    return { sent };
  });

export const sendDueCleaningNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const now = new Date();
    const { data: settings, error: settingsError } = await context.supabase
      .from("household_settings")
      .select("cleaning_notifications_enabled,cleaning_reminder_minutes,cleaning_reminder_hour")
      .limit(1)
      .maybeSingle();
    if (settingsError) throw settingsError;
    if (settings?.cleaning_notifications_enabled === false) return { sent: 0 };

    const lead = settings?.cleaning_reminder_minutes ?? 1440;
    const reminderHour = settings?.cleaning_reminder_hour ?? 9;
    const horizon = new Date(now.getTime() + Math.max(48 * 60, lead + 24 * 60) * 60 * 1000);
    const { data: schedules, error } = await context.supabase
      .from("cleaning_schedules")
      .select("id,name,next_due_at,notification_sent_for")
      .lte("next_due_at", horizon.toISOString())
      .order("next_due_at");
    if (error) throw error;

    const due = (schedules ?? []).filter((schedule) => {
      if (schedule.notification_sent_for === schedule.next_due_at) return false;
      const localDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(schedule.next_due_at));
      const reminderDate = new Date(`${localDate}T${String(reminderHour).padStart(2, "0")}:00:00-03:00`);
      reminderDate.setUTCMinutes(reminderDate.getUTCMinutes() - lead);
      return now >= reminderDate;
    });
    if (!due.length) return { sent: 0 };

    const { data: devices, error: devicesError } = await context.supabase.rpc("household_notification_devices");
    if (devicesError) throw devicesError;
    if (!devices?.length) return { sent: 0 };

    const lovableKey = process.env['LOVABLE_API_KEY'];
    const connectionKey = process.env['FIREBASE_MESSAGING_API_KEY'];
    if (!lovableKey || !connectionKey) throw new Error("Notificações não configuradas");

    let sent = 0;
    for (const schedule of due) {
      let delivered = false;
      const when = new Date(schedule.next_due_at).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      });
      for (const device of devices) {
        const response = await fetch(`${GATEWAY}/v1/projects/_/messages:send`, {
          method: "POST",
          headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": connectionKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: {
              token: device.token,
              notification: { title: "Lavagem chegando", body: `${schedule.name} · ${when}` },
              data: { path: "/" },
            },
          }),
        });
        if (response.ok) {
          sent += 1;
          delivered = true;
        } else if (response.status === 400 || response.status === 404) {
          await context.supabase.rpc("remove_household_notification_device", { _token: device.token });
        } else {
          const body = await response.text();
          console.error(`Firebase request failed [${response.status}]: ${body}`);
        }
      }
      if (delivered) {
        await context.supabase
          .from("cleaning_schedules")
          .update({ notification_sent_for: schedule.next_due_at })
          .eq("id", schedule.id)
          .eq("next_due_at", schedule.next_due_at);
      }
    }
    return { sent };
  });