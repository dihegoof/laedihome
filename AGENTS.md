<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep the cleaning schedule as an Agenda subview backed by household-scoped schedules and immutable completion history, so the main navigation remains unchanged.
- Send cleaning reminders through authenticated server functions to every enabled device in the current household, because connector credentials must remain server-only.
- Keep meal planning as a Pantry subview; perform preparation and inventory consumption in one household-validated database transaction with row locks, so simultaneous confirmations cannot double-consume stock.
- Store an explicit stock unit on products and snapshot ingredient measures in meal plans; reject incompatible measures and changed stock units rather than guessing package sizes.
- Keep weekly-menu dates in route search and subscribe to household-scoped Query data inside the Pantry subview; reuse database RPCs for online-only mutations to preserve atomic stock consumption.
- Undo menu confirmations through a household-scoped RPC locking the plan and stock rows, checking the original confirmation timestamp, and restoring snapshot quantities once; this prevents duplicate refunds or stale cancellation of a later preparation.
- Order weekly-menu meals by meal type and keep legacy time values only for RPC compatibility, so the editor never requires a user-entered time.
- Keep cargo tracking household-scoped with local email parsing; auto-import complete new cargos on paste, skip unchanged duplicates and require editable review for uncertain rows or changed reimports. Reuse locked database RPCs and immutable audit history to prevent stale overwrites and workflow resets.
- Keep the cargo view mounted after its first visit and allow direct cargo switching in the mirror, so tab changes preserve the working context without repeated loading.
- Parse headerless cargo rows with a deterministic fixed-column parser, grouping by household DT and summing per-product pallet snapshots; honor explicit headers first and attach continuation lines only to the preceding recognized row to avoid misreading legacy layouts.
- Keep original cargo registration timestamps immutable on reimport; derive active/history/expired views using São Paulo calendar dates and enforce expiry in read policies and mutation RPCs, avoiding recurring polling jobs.
- Keep cargo billing impediments and departure confirmation separate from invoice, CTe, print and operation stages; completing billing only issues the invoice, preventing accidental workflow advancement.
