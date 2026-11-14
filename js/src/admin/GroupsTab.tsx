import app from 'flarum/admin/app';
import Component from 'flarum/common/Component';
import Button from 'flarum/common/components/Button';
import Icon from 'flarum/common/components/Icon';
import EditGroupModal from 'flarum/admin/components/EditGroupModal';
import extractText from 'flarum/common/utils/extractText';
import isExtensionEnabled from 'flarum/admin/utils/isExtensionEnabled';
import type Mithril from 'mithril';
import { ADMIN, GUEST, MEMBER, allowed, desk, required, rowState, scoped, t } from './state';
import { AREAS, collect, groupBadge, groupColor, groupName, groups, labelFor, restrictedTags, unrestrictedTags, type Row } from './rows';
import { CopyModal, PresetModal } from './modals';

export interface GroupsTabAttrs {
  ui: GroupsUi;
  presets: () => any[];
  reloadPresets: () => void;
}

export interface GroupsUi {
  group: number;
  scope: string;
  q: string;
  by: 'area' | 'ext';
  compare: boolean;
  a: number;
  b: number;
  onlyDiff: boolean;
  hint: { key: string; kind: 'deps' | 'view' | 'inherited'; missing?: string[]; count?: number } | null;
}

export function mark(text: string, q: string): Mithril.Children {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  // One span, so the label's flex gap never splits the word around the highlight.
  if (i < 0) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </span>
  );
}

export function flagBadge(row: Row) {
  if (!row.danger) return null;
  return (
    <span className={'PermissionDesk-flag PermissionDesk-flag--' + row.danger} title={row.desc || row.text}>
      <Icon name="fas fa-triangle-exclamation" /> {t(row.danger === 'red' ? 'risky' : 'sensitive')}
    </span>
  );
}

/**
 * Group-first editing: pick a group, see everything it can do in plain words, switch things on
 * and off (staged, never saved per click), per restricted tag too.
 */
export default class GroupsTab extends Component<GroupsTabAttrs> {
  view() {
    const ui = this.attrs.ui;
    return ui.compare ? this.compareView() : this.groupView();
  }

  rail() {
    const ui = this.attrs.ui;
    const all = groups();
    const label = (id: number) => (id === GUEST ? t('guests_everyone') : groupName(id));
    return [
      <nav className="PermissionDesk-rail" aria-label={extractText(t('groups'))}>
        {all.map((g) => {
          const id = Number(g.id());
          return (
            <button
              className={'PermissionDesk-railItem' + (ui.group === id ? ' is-on' : '')}
              aria-current={ui.group === id ? 'true' : undefined}
              onclick={() => {
                ui.group = id;
                ui.hint = null;
              }}
            >
              <span className="PermissionDesk-dot" style={{ background: groupColor(id) || 'var(--pd-faint)' }} />
              <span className="PermissionDesk-railName">{label(id)}</span>
            </button>
          );
        })}
        <button className="PermissionDesk-railItem PermissionDesk-railItem--add" onclick={() => app.modal.show(EditGroupModal)}>
          <Icon name="fas fa-plus" /> {t('new_group')}
        </button>
      </nav>,
      <label className="PermissionDesk-railPick">
        <span className="visually-hidden">{t('groups')}</span>
        <select
          className="FormControl"
          value={String(ui.group)}
          onchange={(e: Event) => {
            ui.group = Number((e.target as HTMLSelectElement).value);
            ui.hint = null;
          }}
        >
          {all.map((g) => (
            <option value={String(g.id())}>{label(Number(g.id()))}</option>
          ))}
        </select>
      </label>,
    ];
  }

  groupView() {
    const ui = this.attrs.ui;
    const g = ui.group;
    const group = app.store.getById<any>('groups', String(g));
    const tags = restrictedTags();
    if (ui.scope !== 'global' && !tags.find((tag) => tag.id() === ui.scope)) ui.scope = 'global';
    const q = ui.q.trim().toLowerCase();
    let rows = collect().rows.filter((r) => ui.scope === 'global' || r.tagScoped);
    if (q) rows = rows.filter((r) => `${r.text} ${r.desc || ''} ${r.key} ${r.extTitle}`.toLowerCase().includes(q));

    const sections: [Mithril.Children, Row[]][] =
      ui.by === 'area'
        ? AREAS.map((area) => [t('area.' + area), rows.filter((r) => r.area === area)])
        : [...new Set(rows.map((r) => r.ext))].map((ext) => [rows.find((r) => r.ext === ext)!.extTitle, rows.filter((r) => r.ext === ext)]);

    return (
      <div className="PermissionDesk-groups">
        <div className="PermissionDesk-railWrap">{this.rail()}</div>
        <div className="PermissionDesk-main">
          <div className="PermissionDesk-ghead">
            <span className="PermissionDesk-gicon" style={{ background: groupColor(g) || 'var(--pd-faint)' }}>
              {group?.icon() ? <Icon name={group.icon()} /> : groupName(g).charAt(0)}
            </span>
            <div className="PermissionDesk-gtitle">
              <h2>{g === GUEST ? t('guests_everyone') : groupName(g)}</h2>
              <div className="PermissionDesk-muted">
                {g === GUEST ? t('guests_help') : g === MEMBER ? t('members_help') : g === ADMIN ? t('admins_help') : t('group_help')}
              </div>
            </div>
            <div className="PermissionDesk-gactions">
              <Button
                className="Button"
                icon="fas fa-code-compare"
                onclick={() => {
                  ui.compare = true;
                  ui.a = g;
                  ui.b = g === MEMBER ? 4 : MEMBER;
                }}
              >
                {t('compare')}
              </Button>
              <Button
                className="Button"
                icon="far fa-copy"
                disabled={g === ADMIN}
                onclick={() => app.modal.show(CopyModal, { to: g, groupIds: groups().map((x) => Number(x.id())) })}
              >
                {t('copy.button')}
              </Button>
              <Button
                className="Button"
                icon="fas fa-wand-magic-sparkles"
                disabled={g === ADMIN}
                onclick={() => app.modal.show(PresetModal, { group: g, saved: this.attrs.presets(), onChange: this.attrs.reloadPresets })}
              >
                {t('preset.button')}
              </Button>
              {group && g > MEMBER && g !== ADMIN ? (
                <Button
                  className="Button Button--icon"
                  icon="fas fa-pencil"
                  aria-label={extractText(t('edit_group'))}
                  onclick={() => app.modal.show(EditGroupModal, { group })}
                />
              ) : null}
            </div>
          </div>

          {g === ADMIN ? <p className="PermissionDesk-note PermissionDesk-note--info">{t('admins_note')}</p> : null}

          <div className="PermissionDesk-toolbar">
            <input
              className="FormControl PermissionDesk-search"
              type="search"
              value={ui.q}
              placeholder={extractText(t('search_placeholder'))}
              aria-label={extractText(t('search_label'))}
              oninput={(e: InputEvent) => (ui.q = (e.target as HTMLInputElement).value)}
            />
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
            <select
              className="FormControl"
              aria-label={extractText(t('by.label'))}
              value={ui.by}
              onchange={(e: Event) => (ui.by = (e.target as HTMLSelectElement).value as any)}
            >
              <option value="area">{t('by.area')}</option>
              <option value="ext">{t('by.ext')}</option>
            </select>
          </div>

          {ui.scope !== 'global' ? (
            <p className="PermissionDesk-note PermissionDesk-note--info">
              {t('scope.note', { tag: <b>{tags.find((x) => x.id() === ui.scope)?.attribute('name')}</b> })}
            </p>
          ) : null}

          {sections.map(([title, list]) => (list.length ? this.section(title, list) : null))}
          {!rows.length ? <p className="PermissionDesk-note PermissionDesk-note--info">{t('no_match', { q: ui.q })}</p> : null}

          {ui.scope === 'global' && !q && tags.length ? this.tagMatrix(tags) : null}
          {ui.scope === 'global' && !q && isExtensionEnabled('flarum-tags') ? this.restrictControl() : null}
          {ui.scope === 'global' && !q ? this.settings() : null}
        </div>
      </div>
    );
  }

  section(title: Mithril.Children, list: Row[]) {
    const ui = this.attrs.ui;
    const g = ui.group;
    const on = list.filter((r) => allowed(g, scoped(r.key, ui.scope))).length;
    return (
      <section className="PermissionDesk-section">
        <h3>
          <span>{title}</span>
          <span className="PermissionDesk-sectionCount">{t('allowed_of', { on, total: list.length })}</span>
        </h3>
        {list.map((r) => this.row(r))}
      </section>
    );
  }

  row(r: Row) {
    const ui = this.attrs.ui;
    const g = ui.group;
    const key = scoped(r.key, ui.scope);
    const rs = rowState(g, key);
    const changed = desk.staged[key] !== undefined && desk.staged[key].includes(g) !== desk.base(key).includes(g);
    const differs = ui.scope !== 'global' && allowed(g, r.key) !== allowed(g, key);
    const guestBlocked = g === GUEST && !r.allowGuest;
    const name = extractText(r.label);
    const viaText = rs.via ? t(rs.st === 'on' ? 'also_via' : 'via', { group: groupName(rs.via) }) : rs.st === 'lock' ? t('admins_always') : null;

    return [
      <div className={'PermissionDesk-row' + (changed ? ' is-changed' : '')}>
        <span className="PermissionDesk-rowIcon" aria-hidden="true">
          <Icon name={r.icon} />
        </span>
        <div className="PermissionDesk-rowText">
          <div className="PermissionDesk-rowLabel">
            {mark(name, ui.q.trim())}
            {flagBadge(r)}
            {differs ? <span className="PermissionDesk-chip">{t('differs')}</span> : null}
            {ui.by === 'area' && r.ext !== 'core-permissions' ? (
              <span className="PermissionDesk-chip PermissionDesk-chip--ext">{r.extTitle}</span>
            ) : null}
            {changed ? <span className="PermissionDesk-chip PermissionDesk-chip--unsaved">{t('unsaved')}</span> : null}
          </div>
          {r.desc ? <div className="PermissionDesk-rowDesc">{mark(r.desc, ui.q.trim())}</div> : null}
        </div>
        <div className="PermissionDesk-rowSide">
          {viaText ? <span className="PermissionDesk-via">{viaText}</span> : null}
          {guestBlocked ? (
            <span className="PermissionDesk-via">{t('members_only')}</span>
          ) : (
            <button
              type="button"
              role="switch"
              className={'PermissionDesk-switch is-' + rs.st}
              aria-checked={rs.st === 'on' || rs.st === 'lock' ? 'true' : 'false'}
              aria-label={name}
              disabled={rs.st === 'lock'}
              onclick={() => this.toggle(key)}
            />
          )}
        </div>
      </div>,
      ui.hint && ui.hint.key === key ? this.hint() : null,
    ];
  }

  hint() {
    const ui = this.attrs.ui;
    const h = ui.hint!;
    if (h.kind === 'deps') {
      return (
        <div className="PermissionDesk-hint">
          <span>{t('hint.needs', { what: <b>{h.missing!.map((k) => labelFor(k)).join(', ')}</b> })}</span>
          <Button
            className="Button Button--small"
            onclick={() => {
              h.missing!.forEach((k) => desk.stage(k, [...desk.cur(k), ui.group]));
              ui.hint = null;
            }}
          >
            {t('hint.turn_on', { count: h.missing!.length })}
          </Button>
        </div>
      );
    }
    if (h.kind === 'view') return <div className="PermissionDesk-hint">{t('hint.view_off', { count: h.count })}</div>;
    return <div className="PermissionDesk-hint">{t('hint.inherited')}</div>;
  }

  toggle(key: string) {
    const ui = this.attrs.ui;
    const g = ui.group;
    const set = desk.cur(key);
    const on = !set.includes(g);
    desk.stage(key, on ? [...set, g] : set.filter((x) => x !== g));
    ui.hint = null;
    if (on) {
      const missing = required(key).filter((k) => !allowed(g, k));
      if (missing.length) ui.hint = { key, kind: 'deps', missing };
    } else if (rowState(g, key).st === 'inh') {
      ui.hint = { key, kind: 'inherited' };
    } else if (/(^|\.)viewForum$/.test(key)) {
      const prefix = key.slice(0, key.length - 'viewForum'.length);
      const count = collect().rows.filter((r) => required(prefix + r.key).includes(key) && allowed(g, prefix + r.key)).length;
      if (count) ui.hint = { key, kind: 'view', count };
    }
  }

  tagMatrix(tags: any[]) {
    const ui = this.attrs.ui;
    const g = ui.group;
    const cell = (key: string) => {
      const rs = rowState(g, key);
      if (rs.st === 'on' || rs.st === 'lock') return <span className="PermissionDesk-yes">✓</span>;
      if (rs.st === 'inh')
        return (
          <span className="PermissionDesk-inh" title={extractText(t('via', { group: groupName(rs.via!) }))}>
            ✓
          </span>
        );
      return <span className="PermissionDesk-no">–</span>;
    };
    const modRows = collect().rows.filter((r) => r.tagScoped && r.area === 'moderate');
    return (
      <section className="PermissionDesk-section">
        <h3>
          <span>{t('tags.title', { group: g === GUEST ? groupName(GUEST) : groupName(g) })}</span>
        </h3>
        <div className="PermissionDesk-scrollX">
          <table className="PermissionDesk-matrix">
            <thead>
              <tr>
                <th>{t('tags.tag')}</th>
                <th>{t('tags.view')}</th>
                <th>{t('tags.start')}</th>
                <th>{t('tags.reply')}</th>
                <th>{t('tags.moderate')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tags.map((tag) => {
                const id = tag.id();
                const mods = modRows.filter((r) => allowed(g, scoped(r.key, id))).length;
                return (
                  <tr>
                    <td>
                      <span className="PermissionDesk-tagDot" style={{ background: tag.attribute('color') || 'var(--pd-faint)' }} />
                      {tag.attribute('name')}
                    </td>
                    <td>{cell(scoped('viewForum', id))}</td>
                    <td>{cell(scoped('startDiscussion', id))}</td>
                    <td>{cell(scoped('discussion.reply', id))}</td>
                    <td>
                      {g === ADMIN ? (
                        <span className="PermissionDesk-yes">{t('tags.all')}</span>
                      ) : mods ? (
                        <span className="PermissionDesk-yes">{mods}</span>
                      ) : (
                        <span className="PermissionDesk-no">–</span>
                      )}
                    </td>
                    <td>
                      <Button className="Button Button--link" onclick={() => (ui.scope = id)}>
                        {t('tags.edit')}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  restrictControl() {
    const open = unrestrictedTags();
    const restricted = restrictedTags();
    return (
      <section className="PermissionDesk-section PermissionDesk-section--plain">
        <h3>
          <span>{t('tags.restrict_title')}</span>
        </h3>
        <div className="PermissionDesk-restrict">
          <p className="PermissionDesk-muted">{t('tags.restrict_help')}</p>
          {open.length ? (
            <select
              className="FormControl"
              aria-label={extractText(t('tags.restrict'))}
              value=""
              onchange={(e: Event) => {
                const tag = app.store.getById<any>('tags', (e.target as HTMLSelectElement).value);
                if (tag) tag.save({ isRestricted: true }).then(() => m.redraw());
              }}
            >
              <option value="">{t('tags.restrict')}</option>
              {open.map((tag) => (
                <option value={tag.id()}>{tag.attribute('name')}</option>
              ))}
            </select>
          ) : null}
          {restricted.map((tag) => (
            <Button
              className="Button Button--small"
              icon="fas fa-lock-open"
              onclick={() => {
                if (confirm(extractText(t('tags.unrestrict_confirm', { tag: tag.attribute('name') }))))
                  tag.save({ isRestricted: false }).then(() => m.redraw());
              }}
            >
              {t('tags.unrestrict', { tag: tag.attribute('name') })}
            </Button>
          ))}
        </div>
      </section>
    );
  }

  settings() {
    const settings = collect().settings;
    if (!settings.length) return null;
    return (
      <section className="PermissionDesk-section">
        <h3>
          <span>{t('settings.title')}</span>
          <span className="PermissionDesk-sectionCount">{t('settings.help')}</span>
        </h3>
        {settings.map((s) => (
          <div className="PermissionDesk-row">
            <span className="PermissionDesk-rowIcon" aria-hidden="true">
              <Icon name={s.icon} />
            </span>
            <div className="PermissionDesk-rowText">
              <div className="PermissionDesk-rowLabel">{s.label}</div>
            </div>
            <div className="PermissionDesk-rowSide PermissionDesk-setting">{s.setting()}</div>
          </div>
        ))}
      </section>
    );
  }

  compareView() {
    const ui = this.attrs.ui;
    const all = groups().map((g) => Number(g.id()));
    const pick = (value: number, set: (v: number) => void, label: string) => (
      <select
        className="FormControl"
        aria-label={label}
        value={String(value)}
        onchange={(e: Event) => set(Number((e.target as HTMLSelectElement).value))}
      >
        {all.map((id) => (
          <option value={String(id)}>{id === GUEST ? t('guests_everyone') : groupName(id)}</option>
        ))}
      </select>
    );
    const cell = (g: number, key: string) => {
      const rs = rowState(g, key);
      if (rs.st === 'on' || rs.st === 'lock') return <span className="PermissionDesk-yes">✓</span>;
      if (rs.st === 'inh')
        return (
          <span className="PermissionDesk-inh" title={extractText(t('via', { group: groupName(rs.via!) }))}>
            ✓ <small>{groupName(rs.via!)}</small>
          </span>
        );
      return <span className="PermissionDesk-no">–</span>;
    };
    const scopes: [string, Mithril.Children][] = [
      ['global', t('scope.global')],
      ...restrictedTags().map((tag) => [tag.id(), t('scope.in_tag', { tag: tag.attribute('name') })] as [string, Mithril.Children]),
    ];
    let differences = 0;
    const body: Mithril.Children[] = [];
    scopes.forEach(([scope, title]) => {
      const part: Mithril.Children[] = [];
      collect()
        .rows.filter((r) => scope === 'global' || r.tagScoped)
        .forEach((r) => {
          const key = scoped(r.key, scope);
          const d = allowed(ui.a, key) !== allowed(ui.b, key);
          if (d) differences++;
          if (ui.onlyDiff && !d) return;
          part.push(
            <tr className={d ? 'is-diff' : ''}>
              <td>
                {r.text} {flagBadge(r)}
              </td>
              <td className="PermissionDesk-c">{cell(ui.a, key)}</td>
              <td className="PermissionDesk-c">{cell(ui.b, key)}</td>
            </tr>
          );
        });
      if (part.length)
        body.push(
          <tr className="PermissionDesk-subhead">
            <td colspan={3}>{title}</td>
          </tr>,
          ...part
        );
    });

    return (
      <div className="PermissionDesk-compare">
        <div className="PermissionDesk-toolbar">
          <Button className="Button" icon="fas fa-arrow-left" onclick={() => (ui.compare = false)}>
            {t('compare_back', { group: groupName(ui.group) })}
          </Button>
        </div>
        <div className="PermissionDesk-toolbar">
          {pick(ui.a, (v) => (ui.a = v), extractText(t('compare_a')))}
          <span className="PermissionDesk-muted">{t('vs')}</span>
          {pick(ui.b, (v) => (ui.b = v), extractText(t('compare_b')))}
          <label className="PermissionDesk-check">
            <input type="checkbox" checked={ui.onlyDiff} onchange={(e: Event) => (ui.onlyDiff = (e.target as HTMLInputElement).checked)} />{' '}
            {t('only_diff')}
          </label>
          <Button className="Button Button--primary" disabled={ui.b === ADMIN || ui.a === ui.b || !differences} onclick={() => this.match()}>
            {t('match', { b: groupName(ui.b), a: groupName(ui.a) })}
          </Button>
        </div>
        <p className="PermissionDesk-note PermissionDesk-note--info">
          {t('differences', { count: differences, a: groupName(ui.a), b: groupName(ui.b), tags: restrictedTags().length })}
        </p>
        <div className="PermissionDesk-tableWrap">
          <table className="PermissionDesk-cmp">
            <thead>
              <tr>
                <th>{t('permission')}</th>
                <th className="PermissionDesk-c">{groupBadge(ui.a)}</th>
                <th className="PermissionDesk-c">{groupBadge(ui.b)}</th>
              </tr>
            </thead>
            <tbody>
              {body.length ? (
                body
              ) : (
                <tr>
                  <td colspan={3} className="PermissionDesk-muted">
                    {t('no_differences')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  match() {
    const ui = this.attrs.ui;
    let n = 0;
    ['global', ...restrictedTags().map((tag) => tag.id())].forEach((scope) =>
      collect()
        .rows.filter((r) => scope === 'global' || r.tagScoped)
        .forEach((r) => {
          if (ui.b === GUEST && !r.allowGuest) return;
          const key = scoped(r.key, scope);
          const set = desk.cur(key);
          const aHas = allowed(ui.a, key);
          const bOwn = set.includes(ui.b);
          if (aHas && !allowed(ui.b, key)) {
            desk.stage(key, [...set, ui.b]);
            n++;
          } else if (!aHas && bOwn) {
            desk.stage(
              key,
              set.filter((x) => x !== ui.b)
            );
            n++;
          }
        })
    );
    app.alerts.clear();
    app.alerts.show({ type: 'success' }, t('staged', { count: n }));
  }
}
