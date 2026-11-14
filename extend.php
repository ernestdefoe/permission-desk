<?php

/*
 * Permission Desk: a group-first replacement for the admin Permissions page (core's grid comes
 * back when it is switched off, and stays one click away at #/permissions/classic).
 *
 * The API is plain JSON under /api/permission-desk (src/Api/Controller.php), admins only. Saves
 * write group_permission ONLY through core's own SetPermissionController (src/Writer.php).
 *
 * 🚨 String literals only below, never a class constant read at load time: it autoloads during
 * boot and fatals every request while a deploy is swapping composer's autoload map.
 */

use ErnestDefoe\PermissionDesk\Api\Controller;
use ErnestDefoe\PermissionDesk\Console\CheckCommand;
use Flarum\Extend;
use Illuminate\Console\Scheduling\Event as ScheduledEvent;

return [
    (new Extend\Frontend('admin'))
        ->js(__DIR__.'/js/dist/admin.js')
        ->css(__DIR__.'/less/admin.less'),

    new Extend\Locales(__DIR__.'/locale'),

    (new Extend\Routes('api'))
        ->get('/permission-desk/history', 'permission-desk.history', Controller::class)
        ->post('/permission-desk/changesets', 'permission-desk.save', Controller::class)
        ->get('/permission-desk/changesets/{id:\d+}/undo', 'permission-desk.undoPlan', Controller::class)
        ->get('/permission-desk/changesets/{id:\d+}/restore', 'permission-desk.restorePlan', Controller::class)
        ->get('/permission-desk/members/{id:\d+}', 'permission-desk.member', Controller::class)
        ->get('/permission-desk/presets', 'permission-desk.presets', Controller::class)
        ->post('/permission-desk/presets', 'permission-desk.createPreset', Controller::class)
        ->delete('/permission-desk/presets/{id:\d+}', 'permission-desk.deletePreset', Controller::class),

    (new Extend\Console())
        ->command(CheckCommand::class)
        ->schedule(CheckCommand::class, function (ScheduledEvent $event) {
            $event->daily()->withoutOverlapping();
        }),
];
