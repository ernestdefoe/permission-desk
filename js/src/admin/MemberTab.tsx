import app from 'flarum/admin/app';
import Component from 'flarum/common/Component';
import Avatar from 'flarum/common/components/Avatar';
import Icon from 'flarum/common/components/Icon';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import extractText from 'flarum/common/utils/extractText';
import isExtensionEnabled from 'flarum/admin/utils/isExtensionEnabled';
import type Mithril from 'mithril';
import { GUEST, MEMBER, api, desk, required, scoped, t } from './state';
import { AREAS, collect, groupBadge, groupName, restrictedTags, tagName } from './rows';
import { flagBadge } from './GroupsTab';

export interface MemberUi {
  id: number | null;
  q: string;
  results: any[] | null;
  scope: string;
  data: any;
  loading: boolean;
}

interface Check {
  ok: boolean;
  why: Mithril.Children;
}

/**
 * Effective permissions for one member, and why. The server answers with core's own groups for
 * them (unconfirmed email and suspension included) and which group grants each stored permission;
 * this tab adds what core's dependencies require.
 */
export default class MemberTab extends Component<{ ui: MemberUi }> {
  timer: any = null;

  oninit(vnode: Mithril.Vnode<{ ui: MemberUi }, this>) {
    super.oninit(vnode);
    const ui = this.attrs.ui;
    if (ui.id && (!ui.data || ui.data.user.id !== ui.id)) this.load(ui.id);
  }

  load(id: number) {
    const ui = this.attrs.ui;
    ui.id = id;
    ui.loading = true;
    ui.results = null;
    ui.q = '';
    api('GET', '/members/' + id, undefined, true)
      .then((data) => (ui.data = data))
      .catch(() => {
        ui.data = null;
        ui.id = null;
        app.alerts.clear();
        app.alerts.show({ type: 'error' }, t('member.not_found'));
      })
      .finally(() => {
        ui.loading = false;
        m.redraw();
      });
  }

  search(q: string) {
    const ui = this.attrs.ui;
    ui.q = q;
    clearTimeout(this.timer);
    if (q.trim().length < 2) {
      ui.results = null;
      return;
    }
    this.timer = setTimeout(() => {
      app.store.find<any[]>('users', { filter: { q: q.trim() }, page: { limit: 8 } }).then((users: any) => {
        if (ui.q === q) ui.results = users;
        m.redraw();
      });
    }, 250);
  }

  check(key: string, seen: string[] = []): Check {
    const d = this.attrs.ui.data;
    if (d.isAdmin) return { ok: true, why: t('member.admin') };
    for (const r of required(key)) {
      if (seen.includes(r)) continue;
      if (!this.check(r, [...seen, key]).ok) return { ok: false, why: t('member.needs', { what: labelOf(r) }) };
    }
    // Staged changes count too, so "what would this do to Sam?" is answered before saving.
    const set = desk.cur(key);
    const eff: number[] = d.effectiveGroups;
    const via = set.includes(GUEST) ? GUEST : set.includes(MEMBER) && eff.includes(MEMBER) ? MEMBER : set.find((g) => eff.includes(g));
    if (via) return { ok: true, why: t('via', { group: groupName(via) }) };
    const full = [GUEST, MEMBER, ...d.user.groups];
    if (set.some((g) => full.includes(g))) {
      if (!d.user.isEmailConfirmed) return { ok: false, why: t('member.unconfirmed') };
      if (d.user.suspendedUntil) return { ok: false, why: t('member.suspended', { date: dayjs(d.user.suspendedUntil).format('ll') }) };
    }
    if (!set.length) return { ok: false, why: t('member.only_admins') };
    return { ok: false, why: t('member.not_in', { groups: set.map(groupName).join(', ') }) };
  }

  view() {
    const ui = this.attrs.ui;
    const tags = restrictedTags();
    return (
      <div className="PermissionDesk-member">
        <div className="PermissionDesk-toolbar">
          <div className="PermissionDesk-msearch">
            <input
              className="FormControl"
              type="search"
              value={ui.q}
              placeholder={extractText(t('member.search'))}
              aria-label={extractText(t('member.search'))}
              oninput={(e: InputEvent) => this.search((e.target as HTMLInputElement).value)}
            />
            {ui.results ? (
              <div className="PermissionDesk-msugg" role="listbox">
                {ui.results.length ? (
                  ui.results.map((u: any) => (
                    <button role="option" onclick={() => this.load(Number(u.id()))}>
                      <Avatar user={u} /> <span>{u.displayName()}</span> <span className="PermissionDesk-muted">@{u.username()}</span>
                    </button>
                  ))
                ) : (
                  <div className="PermissionDesk-muted PermissionDesk-msuggEmpty">{t('member.no_results')}</div>
                )}
              </div>
            ) : null}
          </div>
          {tags.length ? (
            <select
              className="FormControl"
              aria-label={extractText(t('scope.label'))}
              value={ui.scope}
              onchange={(e: Event) => (ui.scope = (e.target as HTMLSelectElement).value)}
            >
              <option value="global">{t('scope.global')}</option>
              {tags.map((tag) => (
                <option value={tag.id()}>{t('scope.in_tag', { tag: tag.attribute('name') })}</option>
              ))}
            </select>
          ) : null}
        </div>
        {ui.loading ? <LoadingIndicator /> : ui.data ? this.result() : <p className="PermissionDesk-empty">{t('member.pick')}</p>}
      </div>
    );
  }

  result() {
    const ui = this.attrs.ui;
    const d = ui.data;
    const u = d.user;
    const scope = ui.scope;
    const rows = collect().rows.filter((r) => scope === 'global' || r.tagScoped);
    const can = (key: string) => this.check(scoped(key, scope)).ok;
    const first = String(u.displayName).split(' ')[0];
    const guestOnly = !d.isAdmin && d.effectiveGroups.length === 1;

    let summary: Mithril.Children;
    if (d.isAdmin) summary = t('member.sum_admin', { name: first });
    else if (!u.isEmailConfirmed) summary = t('member.sum_unconfirmed', { name: first });
    else if (u.suspendedUntil) summary = t('member.sum_suspended', { name: first, date: dayjs(u.suspendedUntil).format('ll') });
    else if (scope !== 'global') {
      const mods = rows.filter((r) => r.area === 'moderate' && can(r.key)).length;
      summary = !can('viewForum')
        ? t('member.sum_tag_hidden', { name: first, tag: <b>{tagName(scope)}</b> })
        : t('member.sum_tag', {
            name: first,
            tag: <b>{tagName(scope)}</b>,
            start: can('startDiscussion') ? 1 : 0,
            reply: can('discussion.reply') ? 1 : 0,
            mods,
          });
    } else {
      const hidden = restrictedTags().filter((tag) => !this.check(scoped('viewForum', tag.id())).ok);
      const mods = rows.filter((r) => r.area === 'moderate' && can(r.key)).length;
      summary = t('member.sum', {
        name: first,
        start: can('startDiscussion') ? 1 : 0,
        hidden: hidden.length ? hidden.map((tag) => tag.attribute('name')).join(', ') : '',
        has_hidden: hidden.length ? 1 : 0,
        mods,
      });
    }

    const status = [
      u.isEmailConfirmed ? (
        <span className="PermissionDesk-chip PermissionDesk-chip--ok">{t('member.verified')}</span>
      ) : (
        <span className="PermissionDesk-flag PermissionDesk-flag--amber">{t('member.not_verified')}</span>
      ),
      u.suspendedUntil ? (
        <span className="PermissionDesk-flag PermissionDesk-flag--red">
          {t('member.suspended_until', { date: dayjs(u.suspendedUntil).format('ll') })}
        </span>
      ) : null,
    ];

    return (
      <div>
        <div className="PermissionDesk-mhead">
          <span className="PermissionDesk-mavatar">
            {u.avatarUrl ? <img src={u.avatarUrl} alt="" /> : <span>{String(u.displayName).charAt(0).toUpperCase()}</span>}
          </span>
          <div className="PermissionDesk-mtitle">
            <h2>{u.displayName}</h2>
            <div className="PermissionDesk-muted">@{u.username}</div>
            <div className="PermissionDesk-mbadges">
              {u.groups.length ? u.groups.map((g: number) => groupBadge(g)) : <span className="PermissionDesk-muted">{t('member.no_groups')}</span>}
              {status}
            </div>
            <div className="PermissionDesk-muted PermissionDesk-from">
              {t('member.from', { groups: d.isAdmin ? groupName(1) : d.effectiveGroups.map(groupName).join(', ') })}
              {guestOnly ? <b> {t('member.guest_only')}</b> : null}
            </div>
          </div>
          {isExtensionEnabled('ernestdefoe-member-desk') ? (
            <a className="Button" href={'#/users/' + u.id}>
              <Icon name="fas fa-address-card" className="Button-icon" />
              <span className="Button-label">{t('member.open_desk')}</span>
            </a>
          ) : null}
        </div>
        <p className="PermissionDesk-summary">{summary}</p>
        {Object.keys(desk.staged).length ? <p className="PermissionDesk-note PermissionDesk-note--info">{t('member.staged_note')}</p> : null}
        {AREAS.map((area) => {
          const list = rows.filter((r) => r.area === area);
          if (!list.length) return null;
          const checks = list.map((r) => ({ r, c: this.check(scoped(r.key, scope)) }));
          return (
            <section className="PermissionDesk-section">
              <h3>
                <span>{t('area.' + area)}</span>
                <span className="PermissionDesk-sectionCount">
                  {t('allowed_of', { on: checks.filter((x) => x.c.ok).length, total: list.length })}
                </span>
              </h3>
              {checks.map(({ r, c }) => (
                <div className="PermissionDesk-row">
                  <span
                    className={'PermissionDesk-eff ' + (c.ok ? 'PermissionDesk-yes' : 'PermissionDesk-no')}
                    aria-label={extractText(t(c.ok ? 'member.allowed' : 'member.not_allowed'))}
                  >
                    {c.ok ? '✓' : '✗'}
                  </span>
                  <div className="PermissionDesk-rowText">
                    <div className="PermissionDesk-rowLabel">
                      {r.text}
                      {flagBadge(r)}
                    </div>
                  </div>
                  <div className={'PermissionDesk-reason' + (c.ok ? ' is-ok' : '')}>{c.why}</div>
                </div>
              ))}
            </section>
          );
        })}
        <p className="PermissionDesk-note PermissionDesk-note--warn">{t('member.limit', { name: first })}</p>
      </div>
    );
  }
}

function labelOf(key: string): string {
  return extractText(collect().rows.find((r) => key === r.key || key.endsWith('.' + r.key))?.label ?? key);
}
