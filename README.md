# Permission Desk (private, in house)

A group-first replacement for Flarum 2's admin Permissions page, sibling of Member Desk.

- **Groups:** pick a group, see everything it can do in plain words, by area or by extension, everywhere or per restricted tag; dependency hints; inherited "via Everyone/Members".
- **Permissions:** every permission and who has it; filters (Everyone can, one group, admins only, danger flags, not registered).
- **Tags:** built for forums with 100+ tags. Every tag in the forum's tree (children under parents, collapsible), word search ("clubs show"), filters (restricted, not restricted, a group can't see, different from Everywhere), click a cell to switch View/Start/Reply for one group, and bulk changes across selected tags: allow or take away, copy every permission from another tag, restrict or unrestrict. Restricting copies Everywhere's permissions first, so nothing changes for anyone. Warns when a child tag's parent is hidden from the group.
- **Check a member:** what one member can do and why (unconfirmed email and suspension shown as guest).
- **History:** every save with a note; undo (skips rows changed since) and restore to any point; changes made elsewhere are logged too.
- Everywhere else, tags scale too: a searchable tag picker instead of long dropdowns; an opened permission lists only the tags that differ from Everywhere (pick any other, or match them all); compare collapses each tag to one line; the review and History fold the same change across many tags into one line ("in 80 tags").
- Compare and copy groups, presets (five built in + your own), review before save with danger flags, core's classic grid one click away.

Writes nothing but `group_permission`, and only through core's own permission handler. Not for release.
