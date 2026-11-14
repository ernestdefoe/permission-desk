<?php

namespace ErnestDefoe\PermissionDesk;

/**
 * Catches permission changes made outside Permission Desk (core's classic grid, an extension's
 * migration, a console command, a direct database edit) by comparing the live table with the
 * snapshot taken after our last save, and logs the difference to History as one "outside" entry.
 * Runs nightly, before every save, and when History is opened. The first run only takes a snapshot.
 */
class Watcher
{
    public function __construct(
        protected PermissionMap $map,
        protected History $history,
    ) {
    }

    /** @return int|null the new changeset's id, if anything had changed */
    public function check(): ?int
    {
        $current = $this->map->current();
        $snapshot = $this->history->snapshot();

        if ($snapshot === null) {
            $this->history->saveSnapshot($current);

            return null;
        }

        $snapshot = array_map(fn ($ids) => PermissionMap::normalize((array) $ids), $snapshot);
        $diff = PermissionMap::diff($snapshot, $current);

        if (! $diff) {
            return null;
        }

        $id = $this->history->record(null, 'outside', $diff);
        $this->history->saveSnapshot($current);

        return $id;
    }
}
