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
