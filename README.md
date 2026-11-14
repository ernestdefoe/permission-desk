# Permission Desk (private, in house)

A group-first replacement for Flarum 2's admin Permissions page, sibling of Member Desk.

- **Groups:** pick a group, see everything it can do in plain words, by area or by extension, everywhere or per restricted tag; dependency hints; inherited "via Everyone/Members".
- **Permissions:** every permission and who has it; filters (Everyone can, one group, admins only, danger flags, not registered).
- **Check a member:** what one member can do and why (unconfirmed email and suspension shown as guest).
- **History:** every save with a note; undo (skips rows changed since) and restore to any point; changes made elsewhere are logged too.
- Compare and copy groups, presets (five built in + your own), review before save with danger flags, core's classic grid one click away.

Writes nothing but `group_permission`, and only through core's own permission handler. Not for release.
