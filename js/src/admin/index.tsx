import app from 'flarum/admin/app';
import { extend } from 'flarum/common/extend';
import PermissionsPage from 'flarum/admin/components/PermissionsPage';
import ItemList from 'flarum/common/utils/ItemList';
import DeskPage from './DeskPage';
import { EXT, t } from './state';

/** Core's grid, unchanged, one click away; with a way back. */
class ClassicPage extends PermissionsPage {
  content() {
    return [
      <p className="PermissionDesk-classicBack">
        <a className="Button" href={'#' + app.route('permissions')}>
          {t('back_to_desk')}
        </a>
      </p>,
      super.content(),
    ];
  }
}

app.initializers.add(EXT, () => {
  app.routes.permissions = { path: '/permissions', component: DeskPage };
  app.routes['permissionDesk.classic'] = { path: '/permissions/classic', component: ClassicPage };
  app.routes['permissionDesk.member'] = { path: '/permissions/desk/member/:id', component: DeskPage };
  app.routes['permissionDesk.tab'] = { path: '/permissions/desk/:tab', component: DeskPage };

  // Member Desk's member page gets a "Permissions" button (its hook; absent when it isn't installed).
  extend('ext:ernestdefoe/member-desk/common/MemberView' as any, 'heroActions', function (this: any, items: ItemList<any>) {
    const id = this.attrs?.id;
    if (!id) return;
    items.add(
      'permissions',
      <a className="Button" href={'#' + app.route('permissionDesk.member', { id })}>
        <i aria-hidden="true" className="icon fas fa-key Button-icon" />
        <span className="Button-label">{t('member_desk_button')}</span>
      </a>,
      -10
    );
  });
});
