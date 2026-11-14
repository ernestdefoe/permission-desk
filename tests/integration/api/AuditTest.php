<?php

namespace ErnestDefoe\PermissionDesk\Tests\integration\api;

use Flarum\Group\Group;
use Flarum\Testing\integration\RetrievesAuthorizedUsers;
use Flarum\Testing\integration\TestCase;
use Illuminate\Database\ConnectionInterface;
use PHPUnit\Framework\Attributes\Test;

/**
 * With flarum/audit on, each permission a save changes is logged exactly as core's endpoint logs
 * it (`permission_changed`, old and new group ids). Without it, saving still works (PermissionDeskTest).
 */
class AuditTest extends TestCase
{
    use RetrievesAuthorizedUsers;

    protected function setUp(): void
    {
        parent::setUp();

        $this->extension('flarum-audit', 'ernestdefoe-permission-desk');
        $this->prepareDatabase([
            'group_permission' => [['permission' => 'discussion.hidePosts', 'group_id' => Group::MODERATOR_ID]],
        ]);
    }

    #[Test]
    public function every_changed_permission_lands_in_flarums_audit_log(): void
    {
        $r = $this->send($this->request('POST', '/api/permission-desk/changesets', [
            'authenticatedAs' => 1,
            'json' => ['changes' => [
                ['permission' => 'discussion.hidePosts', 'before' => [4], 'after' => [3, 4]],
                ['permission' => 'tag2.discussion.reply', 'before' => [], 'after' => [4]],
            ]],
        ]));
        $this->assertEquals(200, $r->getStatusCode(), (string) $r->getBody());

        $rows = $this->app()->getContainer()->make(ConnectionInterface::class)
            ->table('audit_log')->where('action', 'permission_changed')->orderBy('id')->get();

        $this->assertCount(2, $rows);
        $payload = json_decode($rows[0]->payload, true);
        $this->assertEquals('discussion.hidePosts', $payload['permission']);
        $this->assertEquals([4], $payload['old_group_ids']);
        $this->assertEquals([3, 4], $payload['new_group_ids']);
        $this->assertEquals(1, (int) $rows[0]->actor_id);
    }
}
