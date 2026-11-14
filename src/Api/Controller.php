<?php

namespace ErnestDefoe\PermissionDesk\Api;

use Carbon\Carbon;
use ErnestDefoe\PermissionDesk\Conflict;
use ErnestDefoe\PermissionDesk\Effective;
use ErnestDefoe\PermissionDesk\History;
use ErnestDefoe\PermissionDesk\Planner;
use ErnestDefoe\PermissionDesk\Watcher;
use ErnestDefoe\PermissionDesk\Writer;
use Flarum\Foundation\ValidationException;
use Flarum\Http\RequestUtil;
use Flarum\User\User;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Arr;
use Laminas\Diactoros\Response\EmptyResponse;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * Permission Desk's API: plain JSON under /api/permission-desk, admins only, one route name per
 * method (`permission-desk.<method>`).
 *
 * GET    /permission-desk/history?offset=      History (runs the outside-change check first)
 * POST   /permission-desk/changesets           save reviewed changes {changes, note, kind, undoOf}
 * GET    /permission-desk/changesets/{id}/undo     what Undo would change
 * GET    /permission-desk/changesets/{id}/restore  what Restore to here would change
 * GET    /permission-desk/members/{id}         effective permissions for one member
 * GET/POST /permission-desk/presets, DELETE /permission-desk/presets/{id}
 */
class Controller implements RequestHandlerInterface
{
    protected const METHODS = ['history', 'save', 'undoPlan', 'restorePlan', 'member', 'presets', 'createPreset', 'deletePreset'];

    public function __construct(
        protected Writer $writer,
        protected Planner $planner,
        protected History $history,
        protected Watcher $watcher,
        protected Effective $effective,
        protected ConnectionInterface $db,
    ) {
    }

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $name = (string) $request->getAttribute('routeName');
        $method = substr($name, strrpos($name, '.') + 1);
        $actor = RequestUtil::getActor($request);
        $actor->assertAdmin();

        if (! in_array($method, self::METHODS, true)) {
            throw new \RuntimeException('No method '.$method);
        }

        $result = $this->{$method}($request, $actor);

        return $result instanceof ResponseInterface ? $result : ($result === null ? new EmptyResponse(204) : new JsonResponse($result));
    }

    /** @return array<string, mixed> */
    protected function body(ServerRequestInterface $request): array
    {
        return (array) $request->getParsedBody();
    }

    protected function id(ServerRequestInterface $request): int
    {
        return (int) Arr::get($request->getAttribute('routeParameters', []), 'id');
    }

    /** @return array<string, mixed> */
    protected function history(ServerRequestInterface $request, User $actor): array
    {
        $this->watcher->check();

        return $this->history->page((int) ($request->getQueryParams()['offset'] ?? 0));
    }

    protected function save(ServerRequestInterface $request, User $actor): ResponseInterface
    {
        $body = $this->body($request);
        $kind = in_array($body['kind'] ?? 'save', ['save', 'undo', 'restore'], true) ? ($body['kind'] ?? 'save') : 'save';
        $undoOf = isset($body['undoOf']) ? (int) $body['undoOf'] : null;
        $note = isset($body['note']) && is_string($body['note']) ? $body['note'] : null;

        try {
            $result = $this->writer->save($actor, (array) ($body['changes'] ?? []), $note, $kind === 'undo' && $undoOf ? 'undo' : $kind, $kind === 'undo' ? $undoOf : null);
        } catch (Conflict $e) {
            return new JsonResponse(['conflicts' => (object) $e->current], 409);
        }

        return new JsonResponse(['changeset' => $result['changeset'], 'map' => (object) $result['map']]);
    }

    /** @return array<string, mixed> */
    protected function undoPlan(ServerRequestInterface $request, User $actor): array
    {
        return $this->planner->undo($this->id($request));
    }

    /** @return array<string, mixed> */
    protected function restorePlan(ServerRequestInterface $request, User $actor): array
    {
        return $this->planner->restore($this->id($request));
    }

    /** @return array<string, mixed> */
    protected function member(ServerRequestInterface $request, User $actor): array
    {
        $user = User::query()->with('groups')->findOrFail($this->id($request));

        return $this->effective->forUser($user);
    }

    /** @return array<int, array<string, mixed>> */
    protected function presets(ServerRequestInterface $request, User $actor): array
    {
        return $this->db->table('permission_desk_presets')->orderBy('name')->get()
            ->map(fn ($p) => ['id' => (int) $p->id, 'name' => $p->name, 'permissions' => json_decode($p->permissions, true)])
            ->all();
    }

    /** @return array<string, mixed> */
    protected function createPreset(ServerRequestInterface $request, User $actor): array
    {
        $body = $this->body($request);
        $name = trim((string) ($body['name'] ?? ''));
        $keys = array_values(array_unique(array_filter((array) ($body['permissions'] ?? []), fn ($k) => is_string($k) && preg_match(Writer::KEY, $k))));

        if ($name === '' || mb_strlen($name) > 100) {
            throw new ValidationException(['name' => 'Give the preset a name (up to 100 characters).']);
        }

        $id = (int) $this->db->table('permission_desk_presets')->insertGetId([
            'name' => $name,
            'permissions' => json_encode($keys),
            'user_id' => $actor->id,
            'created_at' => Carbon::now(),
        ]);

        return ['id' => $id, 'name' => $name, 'permissions' => $keys];
    }

    protected function deletePreset(ServerRequestInterface $request, User $actor): null
    {
        $this->db->table('permission_desk_presets')->where('id', $this->id($request))->delete();

        return null;
    }
}
