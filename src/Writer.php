<?php

namespace ErnestDefoe\PermissionDesk;

use Flarum\Api\Controller\SetPermissionController;
use Flarum\Extension\ExtensionManager;
use Flarum\Foundation\ValidationException;
use Flarum\Group\Group;
use Flarum\Http\RequestUtil;
use Flarum\User\User;
use Illuminate\Database\ConnectionInterface;
use Laminas\Diactoros\ServerRequest;

/**
 * Saves a reviewed set of changes. Every write is core's own SetPermissionController (the same
 * handler behind POST /api/permission: admin check, full replace of one permission's groups,
 * permission cache flush), called once per permission inside one transaction. Nothing else ever
 * touches group_permission.
 *
 * flarum/audit logs core's endpoint with middleware on the HTTP route, which a direct call skips,
 * so we write the same `permission_changed` entry it would.
 */
class Writer
{
    public const KEY = '/^[A-Za-z0-9_.\-]{1,100}$/';

    public function __construct(
        protected ConnectionInterface $db,
        protected PermissionMap $map,
        protected History $history,
        protected Watcher $watcher,
        protected SetPermissionController $controller,
        protected ExtensionManager $extensions,
    ) {
    }

    /**
     * @param array<int, array{permission?: mixed, before?: mixed, after?: mixed}> $input
     * @return array{changeset: int, map: array<string, int[]>}
     *
     * @throws Conflict when a permission changed since the admin loaded the page
     */
    public function save(User $actor, array $input, ?string $note = null, string $kind = 'save', ?int $undoOf = null): array
    {
        $actor->assertAdmin();
        $changes = $this->validate($input);

        return $this->db->transaction(function () use ($actor, $changes, $note, $kind, $undoOf) {
            // Anything changed elsewhere since the last snapshot goes into History first.
            $this->watcher->check();

            $current = $this->map->current();
            $conflicts = [];
            foreach ($changes as $key => $change) {
                if (($current[$key] ?? []) !== $change['before']) {
                    $conflicts[$key] = $current[$key] ?? [];
                }
            }
            if ($conflicts) {
                throw new Conflict($conflicts);
            }

            if ($undoOf !== null) {
                $original = $this->db->table('permission_desk_changesets')->where('id', $undoOf)->first();
                if (! $original || $original->undone_by) {
                    throw new ValidationException(['undoOf' => 'That entry can no longer be undone.']);
                }
            }

            $audit = $this->extensions->isEnabled('flarum-audit') && class_exists(\Flarum\Audit\AuditLogger::class);

            foreach ($changes as $key => $change) {
                $request = RequestUtil::withActor(
                    (new ServerRequest([], [], '/permission', 'POST'))->withParsedBody(['permission' => $key, 'groupIds' => $change['after']]),
                    $actor
                );
                $this->controller->handle($request);

                if ($audit) {
                    \Flarum\Audit\AuditLogger::$actor ??= $actor;
                    \Flarum\Audit\AuditLogger::log('permission_changed', [
                        'permission' => $key,
                        'old_group_ids' => $change['before'],
                        'new_group_ids' => $change['after'],
                    ]);
                }
            }

            $id = $this->history->record($actor, $kind, $changes, $note, $undoOf);
            $map = $this->map->current();
            $this->history->saveSnapshot($map);

            return ['changeset' => $id, 'map' => $map];
        });
    }

    /**
     * @param array<int, mixed> $input
     * @return array<string, array{before: int[], after: int[]}>
     */
    protected function validate(array $input): array
    {
        if (! $input) {
            throw new ValidationException(['changes' => 'Nothing to save.']);
        }

        $groups = Group::query()->pluck('id')->map(fn ($id) => (int) $id)->all();
        $out = [];

        foreach ($input as $row) {
            $key = is_array($row) ? ($row['permission'] ?? null) : null;
            if (! is_string($key) || ! preg_match(self::KEY, $key)) {
                throw new ValidationException(['changes' => 'Not a permission name.']);
            }

            $before = PermissionMap::normalize((array) ($row['before'] ?? []));
            $after = PermissionMap::normalize((array) ($row['after'] ?? []));

            foreach ($after as $id) {
                if (! in_array($id, $groups, true)) {
                    throw new ValidationException(['changes' => 'No such group: '.$id]);
                }
            }

            if ($before !== $after) {
                $out[$key] = ['before' => $before, 'after' => $after];
            }
        }

        if (! $out) {
            throw new ValidationException(['changes' => 'Nothing to save.']);
        }

        ksort($out);

        return $out;
    }
}
