import './style.css'

type User = { id: number; username: string; display_name: string; role: 'super_admin' | 'admin' | 'cr'; phone?: string; is_active?: number; assigned_groups?: Group[] }
type EventItem = { id: number; type: string; title: string; event_date: string; venue?: string; syllabus?: string; notes?: string; custom_message?: string; status: string; group_name?: string; target_group_jid?: string }
type Group = { jid: string; name: string; alias?: string; is_default: number; rowid: number }
type Stats = { activeEvents: number; pendingReminders: number; sentReminders: number; totalGroups: number; totalUsers: number; botConnected: boolean; uptime: number; defaultGroup?: { name: string; alias?: string } | null }

const root = document.querySelector<HTMLDivElement>('#app')!
const tokenKey = 'crb_token'
const userKey = 'crb_user'
let token = localStorage.getItem(tokenKey)
let currentUser: User | null = JSON.parse(localStorage.getItem(userKey) || 'null')
let path = window.location.pathname
let toastTimer: number | undefined
let darkMode = localStorage.getItem('crb_theme') === 'dark'

document.documentElement.classList.toggle('dark-mode', darkMode)

async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`/api${url}`, { ...options, headers })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (response.status === 401) logout()
    throw new Error(body.error || 'Request failed')
  }
  return body as T
}

function escape(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char] || char))
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function showToast(message: string, error = false): void {
  let element = document.querySelector<HTMLDivElement>('.toast')
  if (!element) {
    element = document.createElement('div')
    element.className = 'toast'
    document.body.append(element)
  }
  element.textContent = message
  element.classList.toggle('error', error)
  element.classList.add('visible')
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => element?.classList.remove('visible'), 3000)
}

function confirmDialog(title: string, message: string): Promise<boolean> {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog')
    dialog.innerHTML = `<form method="dialog" class="dialog-form"><h2>${escape(title)}</h2><p class="muted">${escape(message)}</p><div class="form-actions"><button type="button" class="secondary" data-dialog="cancel">Cancel</button><button type="button" class="primary" data-dialog="confirm">Continue</button></div></form>`
    document.body.append(dialog)
    const finish = (value: boolean) => { dialog.close(); dialog.remove(); resolve(value) }
    dialog.querySelector('[data-dialog="cancel"]')?.addEventListener('click', () => finish(false))
    dialog.querySelector('[data-dialog="confirm"]')?.addEventListener('click', () => finish(true))
    dialog.addEventListener('cancel', () => { dialog.remove(); resolve(false) }, { once: true })
    dialog.showModal()
  })
}

function promptDialog(title: string, label: string, initialValue = ''): Promise<string | null> {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog')
    dialog.innerHTML = `<form method="dialog" class="dialog-form"><h2>${escape(title)}</h2><label>${escape(label)}<input name="value" required value="${escape(initialValue)}"></label><div class="form-actions"><button type="button" class="secondary" data-dialog="cancel">Cancel</button><button type="button" class="primary" data-dialog="save">Save</button></div></form>`
    document.body.append(dialog)
    const input = dialog.querySelector<HTMLInputElement>('input')!
    const finish = (value: string | null) => { dialog.close(); dialog.remove(); resolve(value) }
    dialog.querySelector('[data-dialog="cancel"]')?.addEventListener('click', () => finish(null))
    dialog.querySelector('[data-dialog="save"]')?.addEventListener('click', () => input.value.trim() && finish(input.value.trim()))
    dialog.addEventListener('cancel', () => { dialog.remove(); resolve(null) }, { once: true })
    dialog.showModal()
    input.focus()
  })
}

function navigate(next: string): void {
  window.history.pushState({}, '', next)
  path = next
  render()
}

function logout(): void {
  token = null
  currentUser = null
  localStorage.removeItem(tokenKey)
  localStorage.removeItem(userKey)
  navigate('/login')
}

function icon(_name: string): string {
  const icons: Record<string, string> = { send: '↗', edit: '✎', suspend: '−', restore: '↺', delete: '×', groups: '▦' }
  return icons[_name] || ''
}

function loginPage(): void {
  root.innerHTML = `<main class="auth-shell"><section class="auth-card">
    <div class="brand-mark">CRB</div><p class="eyebrow">CLASS REPRESENTATIVE BOT</p><h1>Welcome back</h1>
    <p class="muted">Sign in to manage announcements, reminders, and your class groups.</p>
    <form id="login-form" class="stack">
      <label>Username<input name="username" autocomplete="username" required placeholder="admin"></label>
      <label>Password<input name="password" type="password" autocomplete="current-password" required placeholder="••••••••"></label>
      <button class="primary full" type="submit">Sign in <span>→</span></button>
      <p id="login-error" class="form-error"></p>
    </form>
  </section></main>`
  document.querySelector<HTMLFormElement>('#login-form')!.addEventListener('submit', async event => {
    event.preventDefault()
    const form = new FormData(event.currentTarget as HTMLFormElement)
    const error = document.querySelector<HTMLParagraphElement>('#login-error')!
    error.textContent = ''
    try {
      const result = await api<{ token: string; user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ username: form.get('username'), password: form.get('password') }) })
      token = result.token
      currentUser = result.user
      localStorage.setItem(tokenKey, token)
      localStorage.setItem(userKey, JSON.stringify(currentUser))
      navigate('/')
    } catch (err) { error.textContent = err instanceof Error ? err.message : 'Unable to sign in' }
  })
}

function layout(content: string, title: string): void {
  const isSuperAdmin = currentUser?.role === 'super_admin'
  const isAdmin = currentUser?.role === 'admin'
  const canManageGroups = Boolean(currentUser)
  root.innerHTML = `<div class="app-shell"><aside class="sidebar">
    <div class="logo"><span>✦</span><div>CRB<small>CONTROL CENTER</small></div></div>
    <nav><button data-nav="/" class="${path === '/' ? 'active' : ''}">${icon('grid')} Overview</button>
      <button data-nav="/events" class="${path.startsWith('/events') ? 'active' : ''}">${icon('calendar')} Events</button>
      ${canManageGroups ? `<button data-nav="/groups" class="${path === '/groups' ? 'active' : ''}">${icon('groups')} Groups</button>` : ''}
      ${isSuperAdmin ? `<button data-nav="/users" class="${path === '/users' ? 'active' : ''}">${icon('users')} Admins</button>` : ''}
      ${isSuperAdmin || isAdmin ? `<button data-nav="/wa-admins" class="${path === '/wa-admins' ? 'active' : ''}">${icon('phone')} CR</button>` : ''}
      <button data-nav="/settings" class="${path === '/settings' ? 'active' : ''}">${icon('settings')} Settings</button>
    </nav><div class="sidebar-bottom"><div class="profile"><div class="avatar">${escape((currentUser?.display_name || 'U')[0])}</div><div><strong>${escape(currentUser?.display_name)}</strong><small>${escape(currentUser?.role?.replace('_', ' '))}</small></div></div><button id="logout" class="logout">${icon('logout')} Sign out</button></div>
  </aside><main class="main"><header><div><p class="eyebrow">CRB / ${escape(title.toUpperCase())}</p><h1>${escape(title)}</h1></div><div class="header-actions"><button id="theme-toggle" class="theme-toggle">${darkMode ? 'Light mode' : 'Dark mode'}</button><span class="live-dot"></span> System online</div></header><section class="content">${content}</section></main></div>`
  document.querySelectorAll<HTMLButtonElement>('[data-nav]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.nav || '/')))
  document.querySelector<HTMLButtonElement>('#logout')?.addEventListener('click', logout)
  document.querySelector<HTMLButtonElement>('#theme-toggle')?.addEventListener('click', () => {
    darkMode = !darkMode
    localStorage.setItem('crb_theme', darkMode ? 'dark' : 'light')
    document.documentElement.classList.toggle('dark-mode', darkMode)
    render()
  })
}

async function dashboard(): Promise<void> {
  layout('<div class="loading">Loading dashboard…</div>', 'Overview')
  try {
    const [statsResult, eventsResult] = await Promise.all([api<{ data: Stats }>('/stats'), api<{ data: EventItem[] }>('/events')])
    const stats = statsResult.data
    const events = eventsResult.data.slice(0, 5)
    layout(`<div class="stats-grid">
      ${statCard('Active events', stats.activeEvents, 'scheduled reminders', 'cyan')}
      ${statCard('Pending reminders', stats.pendingReminders, 'in the queue', 'violet')}
      ${statCard('Connected groups', stats.totalGroups, stats.defaultGroup ? `Default: ${stats.defaultGroup.name}` : 'No default group', 'blue')}
      ${statCard('Bot status', stats.botConnected ? 'Online' : 'Offline', stats.botConnected ? 'WhatsApp connected' : 'Waiting for connection', stats.botConnected ? 'green' : 'orange')}
    </div><div class="split-grid"><section class="panel"><div class="panel-title"><div><p class="eyebrow">SCHEDULE</p><h2>Upcoming events</h2></div><button class="text-button" data-nav="/events">View all →</button></div>${events.length ? `<div class="event-list">${events.map(eventRow).join('')}</div>` : emptyState('No upcoming events', 'Create your first class announcement to get started.')}</section><section class="panel quick-panel"><p class="eyebrow">QUICK ACTIONS</p><h2>Keep your class informed</h2><p class="muted">Create a scheduled announcement or send an update to your default group.</p><button class="primary full" data-nav="/events/new">${icon('plus')} Create event</button><button class="secondary full" data-nav="/groups">${icon('groups')} Manage groups</button></section></div>`, 'Overview')
    document.querySelectorAll<HTMLButtonElement>('[data-nav]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.nav || '/')))
  } catch (err) { showToast(err instanceof Error ? err.message : 'Could not load dashboard', true) }
}

function statCard(label: string, value: string | number, note: string, tone: string): string {
  return `<article class="stat-card ${tone}"><span class="stat-label">${label}</span><strong>${value}</strong><small>${note}</small></article>`
}

function eventRow(event: EventItem): string {
  return `<button class="event-row" data-event="${event.id}"><span class="event-date">${new Date(event.event_date).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span><span><strong>${escape(event.title)}</strong><small>${escape(event.group_name || 'Unassigned')} · ${escape(event.type)}</small></span><span class="status ${event.status}">${event.status}</span><span>→</span></button>`
}

function emptyState(title: string, detail: string): string { return `<div class="empty"><div class="empty-icon">◌</div><h3>${title}</h3><p>${detail}</p></div>` }

async function eventsPage(): Promise<void> {
  layout('<div class="loading">Loading events…</div>', 'Events')
  try {
    const result = await api<{ data: EventItem[] }>('/events/all')
    const events = result.data
    layout(`<div class="page-toolbar"><div class="filters"><button class="filter active" data-filter="all">All</button><button class="filter" data-filter="active">Active</button><button class="filter" data-filter="cancelled">Suspended</button></div><button class="primary" data-nav="/events/new">+ New event</button></div><section class="panel table-panel"><div class="table-head"><span>EVENT</span><span>DATE & TIME</span><span>GROUP</span><span>STATUS</span><span>ACTIONS</span></div><div id="events-table">${events.length ? events.map(e => `<div class="table-row" data-status="${e.status}"><div><strong>#${e.id} ${escape(e.title)}</strong><small>${escape(e.type)}</small></div><span>${formatDate(e.event_date)}</span><span>${escape(e.group_name || '—')}</span><span class="status ${e.status}">${e.status === 'cancelled' ? 'suspended' : e.status}</span><div class="row-actions"><button data-trigger="${e.id}" data-tooltip="Send announcement" aria-label="Send announcement">${icon('send')}</button><button data-edit="${e.id}" data-tooltip="Edit event" aria-label="Edit event">${icon('edit')}</button>${e.status === 'active' ? `<button data-cancel="${e.id}" data-tooltip="Suspend event" aria-label="Suspend event">${icon('suspend')}</button>` : `<button data-restore="${e.id}" data-tooltip="Restore event" aria-label="Restore event">${icon('restore')}</button>`}<button data-delete-event="${e.id}" data-tooltip="Delete permanently" aria-label="Delete permanently">${icon('delete')}</button></div></div>`).join('') : emptyState('No events found', 'Create an event to see it here.')}</div></section>`, 'Events')
    document.querySelectorAll<HTMLButtonElement>('[data-nav]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.nav || '/')))
    document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('.filter').forEach(item => item.classList.remove('active')); button.classList.add('active'); document.querySelectorAll<HTMLElement>('.table-row').forEach(row => { row.hidden = button.dataset.filter !== 'all' && row.dataset.status !== button.dataset.filter }) }))
    document.querySelectorAll<HTMLButtonElement>('[data-trigger]').forEach(button => button.addEventListener('click', async () => { try { await api(`/events/${button.dataset.trigger}/trigger`, { method: 'POST' }); showToast('Announcement sent'); } catch (err) { showToast(err instanceof Error ? err.message : 'Send failed', true) } }))
    document.querySelectorAll<HTMLButtonElement>('[data-edit]').forEach(button => button.addEventListener('click', () => navigate(`/events/${button.dataset.edit}/edit`)))
    document.querySelectorAll<HTMLButtonElement>('[data-cancel]').forEach(button => button.addEventListener('click', async () => { if (!await confirmDialog('Suspend event', 'This will stop future reminders and mark the event as suspended.')) return; try { await api(`/events/${button.dataset.cancel}/cancel`, { method: 'POST' }); showToast('Event suspended'); eventsPage() } catch (err) { showToast(err instanceof Error ? err.message : 'Suspend failed', true) } }))
    document.querySelectorAll<HTMLButtonElement>('[data-restore]').forEach(button => button.addEventListener('click', async () => { try { await api(`/events/${button.dataset.restore}`, { method: 'PUT', body: JSON.stringify({ status: 'active' }) }); showToast('Event restored'); eventsPage() } catch (err) { showToast(err instanceof Error ? err.message : 'Restore failed', true) } }))
    document.querySelectorAll<HTMLButtonElement>('[data-delete-event]').forEach(button => button.addEventListener('click', async () => { if (!await confirmDialog('Delete event permanently', 'This removes the event and all of its reminders. This cannot be undone.')) return; try { await api(`/events/${button.dataset.deleteEvent}`, { method: 'DELETE' }); showToast('Event permanently deleted'); eventsPage() } catch (err) { showToast(err instanceof Error ? err.message : 'Delete failed', true) } }))
  } catch (err) { showToast(err instanceof Error ? err.message : 'Could not load events', true) }
}

async function eventForm(id?: string): Promise<void> {
  let event: EventItem | undefined
  let groups: Group[] = []
  try { if (id) event = (await api<{ data: EventItem }>(`/events/${id}`)).data; groups = (await api<{ data: Group[] }>('/groups')).data } catch (err) { showToast(err instanceof Error ? err.message : 'Could not load form', true) }
  layout(`<form id="event-form" class="form-panel"><div class="form-actions"><strong>Message mode</strong><label class="toggle-line"><input id="raw-toggle" type="checkbox" ${event?.custom_message ? 'checked' : ''}> Use raw message</label><label class="toggle-line"><input name="sendNow" type="checkbox" value="true" checked> Send immediately after creation</label></div><div id="structured-fields" class="form-grid"><label>Event type<select name="type" ${id ? 'disabled' : ''}>${['ct', 'assignment', 'lab', 'presentation', 'broadcast'].map(type => `<option ${event?.type === type ? 'selected' : ''}>${type}</option>`).join('')}</select></label><label>Title<input name="title" ${event?.custom_message ? '' : 'required'} value="${escape(event?.title === 'Custom announcement' ? '' : event?.title)}" placeholder="CSE 311 CT-2"></label><label>Date and time<input name="event_date" type="datetime-local" required value="${event ? new Date(event.event_date).toISOString().slice(0, 16) : ''}"></label><label>Target group<select name="target_group_jid">${groups.map(group => `<option value="${escape(group.jid)}" ${event?.target_group_jid === group.jid || (!event && group.is_default) ? 'selected' : ''}>${escape(group.name)}${group.is_default ? ' (default)' : ''}</option>`).join('')}</select></label><label>Venue<input name="venue" value="${escape(event?.venue)}" placeholder="Room 402"></label><label>Syllabus<textarea name="syllabus" placeholder="Topics, chapters, or instructions">${escape(event?.syllabus)}</textarea></label><label class="wide">Notes<textarea name="notes" placeholder="Optional details">${escape(event?.notes)}</textarea></label></div><div id="raw-fields" class="form-grid" hidden><label class="wide">Raw WhatsApp message<textarea name="custom_message" rows="10" placeholder="Write the exact message to send...">${escape(event?.custom_message)}</textarea></label><label>Date and time<input name="raw_event_date" type="datetime-local" value="${event ? new Date(event.event_date).toISOString().slice(0, 16) : ''}"></label><label>Target group<select name="raw_target_group_jid">${groups.map(group => `<option value="${escape(group.jid)}" ${event?.target_group_jid === group.jid || (!event && group.is_default) ? 'selected' : ''}>${escape(group.name)}${group.is_default ? ' (default)' : ''}</option>`).join('')}</select></label></div><div class="form-actions"><button type="button" class="secondary" data-nav="/events">Cancel</button><button class="primary" type="submit">${id ? 'Save changes' : 'Create event'}</button></div></form>`, id ? 'Edit event' : 'New event')
  const rawToggle = document.querySelector<HTMLInputElement>('#raw-toggle')!
  const structuredFields = document.querySelector<HTMLElement>('#structured-fields')!
  const rawFields = document.querySelector<HTMLElement>('#raw-fields')!
  const syncMode = () => { const raw = rawToggle.checked; structuredFields.hidden = raw; rawFields.hidden = !raw; structuredFields.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[required]').forEach(input => { input.required = !raw }) }
  rawToggle.addEventListener('change', syncMode)
  syncMode()
  document.querySelectorAll<HTMLButtonElement>('[data-nav]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.nav || '/events')))
  document.querySelector<HTMLFormElement>('#event-form')!.addEventListener('submit', async formEvent => { formEvent.preventDefault(); const form = formEvent.currentTarget as HTMLFormElement; const data = Object.fromEntries(new FormData(form)); if (rawToggle.checked) { data.title = 'Custom announcement'; data.event_date = data.raw_event_date; data.target_group_jid = data.raw_target_group_jid } delete data.raw_event_date; delete data.raw_target_group_jid; if (id) delete data.sendNow; try { await api(id ? `/events/${id}` : '/events', { method: id ? 'PUT' : 'POST', body: JSON.stringify(data) }); showToast(id ? 'Event updated' : 'Event created'); navigate('/events') } catch (err) { showToast(err instanceof Error ? err.message : 'Save failed', true) } })
}

async function groupsPage(): Promise<void> {
  layout('<div class="loading">Loading groups…</div>', 'Groups')
  try {
    const groups = (await api<{ data: Group[] }>('/groups')).data
    const canControl = currentUser?.role !== 'cr'
    layout(`<div class="page-toolbar"><p class="muted">${groups.length} ${canControl ? 'WhatsApp groups registered' : 'assigned groups'}</p>${canControl ? `<button id="sync-groups" class="secondary">${icon('refresh')} Sync groups</button>` : '<p class="muted">Groups are managed by admins</p>'}</div><section class="cards-grid">${groups.length ? groups.map(group => `<article class="group-card"><div class="group-symbol">${icon('groups')}</div><h3>${escape(group.name)}</h3><p class="muted">${escape(group.jid)}</p><div class="group-meta"><span>${group.alias ? `@${escape(group.alias)}` : 'No alias'}</span>${group.is_default ? '<span class="badge">DEFAULT</span>' : ''}</div>${canControl ? `<div class="group-actions">${!group.is_default ? `<button data-default="${escape(group.jid)}" class="secondary">Set default</button>` : ''}<button data-alias="${escape(group.jid)}" class="secondary">Alias</button></div>` : ''}</article>`).join('') : emptyState('No groups assigned', canControl ? 'Connect WhatsApp and sync your groups.' : 'Ask an admin to assign groups to your account.')}</section>`, 'Groups')
    document.querySelector<HTMLButtonElement>('#sync-groups')?.addEventListener('click', async () => { try { await api('/groups/sync', { method: 'POST' }); showToast('Groups synced'); groupsPage() } catch (err) { showToast(err instanceof Error ? err.message : 'Sync failed', true) } })
    document.querySelectorAll<HTMLButtonElement>('[data-default]').forEach(button => button.addEventListener('click', async () => { try { await api(`/groups/${encodeURIComponent(button.dataset.default || '')}/default`, { method: 'PUT' }); showToast('Default group updated'); groupsPage() } catch (err) { showToast(err instanceof Error ? err.message : 'Update failed', true) } }))
    document.querySelectorAll<HTMLButtonElement>('[data-alias]').forEach(button => button.addEventListener('click', async () => { const alias = await promptDialog('Group alias', 'Enter a short alias'); if (!alias) return; try { await api(`/groups/${encodeURIComponent(button.dataset.alias || '')}/alias`, { method: 'PUT', body: JSON.stringify({ alias }) }); showToast('Alias saved'); groupsPage() } catch (err) { showToast(err instanceof Error ? err.message : 'Update failed', true) } }))
  } catch (err) { showToast(err instanceof Error ? err.message : 'Could not load groups', true) }
}

async function usersPage(): Promise<void> {
  layout('<div class="loading">Loading users…</div>', 'Users')
  try {
    const users = (await api<{ data: User[] }>('/users')).data
    layout(`<div class="page-toolbar"><p class="muted">Dashboard accounts and access roles</p><button id="new-user" class="primary">+ Add admin</button></div><section class="panel table-panel"><div class="table-head"><span>USER</span><span>ROLE</span><span>PHONE</span><span>STATUS</span><span>ACTIONS</span></div>${users.map(user => `<div class="table-row"><div><strong>${escape(user.display_name)}</strong><small>@${escape(user.username)}</small></div><span class="role">${escape(user.role.replace('_', ' '))}</span><span>${escape(user.phone || '—')}</span><span class="status ${user.is_active ? 'active' : 'cancelled'}">${user.is_active ? 'active' : 'suspended'}</span><div class="row-actions">${user.role !== 'super_admin' ? `${user.is_active ? `<button data-deactivate="${user.id}" data-tooltip="Suspend admin" aria-label="Suspend admin">${icon('suspend')}</button>` : `<button data-activate="${user.id}" data-tooltip="Restore admin" aria-label="Restore admin">${icon('restore')}</button>`}<button data-delete-user="${user.id}" data-tooltip="Delete permanently" aria-label="Delete permanently">${icon('delete')}</button>` : '—'}</div></div>`).join('')}</section>`, 'Admins')
    document.querySelector<HTMLButtonElement>('#new-user')?.addEventListener('click', () => userDialog('admin'))
    document.querySelectorAll<HTMLButtonElement>('[data-deactivate]').forEach(button => button.addEventListener('click', async () => { if (!await confirmDialog('Suspend admin', 'This account will no longer be able to sign in.')) return; try { await api(`/users/${button.dataset.deactivate}`, { method: 'DELETE' }); showToast('Admin suspended'); usersPage() } catch (err) { showToast(err instanceof Error ? err.message : 'Action failed', true) } }))
    document.querySelectorAll<HTMLButtonElement>('[data-activate]').forEach(button => button.addEventListener('click', async () => { try { await api(`/users/${button.dataset.activate}`, { method: 'PUT', body: JSON.stringify({ isActive: true }) }); showToast('User restored'); usersPage() } catch (err) { showToast(err instanceof Error ? err.message : 'Restore failed', true) } }))
    document.querySelectorAll<HTMLButtonElement>('[data-delete-user]').forEach(button => button.addEventListener('click', async () => { if (!await confirmDialog('Delete admin permanently', 'This permanently removes the admin account. This cannot be undone.')) return; try { await api(`/users/${button.dataset.deleteUser}/permanent`, { method: 'DELETE' }); showToast('Admin permanently deleted'); usersPage() } catch (err) { showToast(err instanceof Error ? err.message : 'Delete failed', true) } }))
  } catch (err) { showToast(err instanceof Error ? err.message : 'Could not load users', true) }
}

function userDialog(role: 'admin' | 'cr'): void {
  const dialog = document.createElement('dialog')
  dialog.innerHTML = `<form method="dialog" id="user-form" class="dialog-form"><h2>Add ${role === 'admin' ? 'admin' : 'CR'} account</h2><label>Username<input name="username" required></label><label>Display name<input name="displayName" required></label><label>Password<input name="password" type="password" minlength="6" required></label><input type="hidden" name="role" value="${role}"><label>Phone<input name="phone" inputmode="numeric" pattern="[0-9]+" placeholder="8801…" required></label><div class="form-actions"><button type="button" class="secondary" value="cancel">Cancel</button><button class="primary" value="save">Create ${role === 'admin' ? 'admin' : 'CR'}</button></div></form>`
  document.body.append(dialog); dialog.showModal()
  dialog.querySelector<HTMLButtonElement>('button[value="cancel"]')?.addEventListener('click', () => { dialog.close(); dialog.remove() })
  dialog.querySelector<HTMLFormElement>('#user-form')!.addEventListener('submit', async event => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement)); try { await api('/users', { method: 'POST', body: JSON.stringify(data) }); dialog.close(); dialog.remove(); showToast('User created'); role === 'cr' ? crManagementPage() : usersPage() } catch (err) { showToast(err instanceof Error ? err.message : 'Create failed', true) } })
  dialog.addEventListener('close', () => dialog.remove())
}

async function adminsPage(): Promise<void> {
  layout('<div class="loading">Loading WhatsApp admins…</div>', 'WhatsApp admins')
  try {
    const admins = (await api<{ data: { phone: string; name: string; role: string; is_active: number }[] }>('/admins')).data
    layout(`<div class="page-toolbar"><p class="muted">Class representative phone numbers allowed to control the bot</p><button id="new-admin" class="primary">+ Add CR</button></div><section class="panel table-panel">${admins.map(admin => `<div class="table-row"><div><strong>${escape(admin.name || 'Unnamed')}</strong><small>${escape(admin.phone)}</small></div><span class="role">${escape(admin.role)}</span><span></span><span class="status ${admin.is_active ? 'active' : 'cancelled'}">${admin.is_active ? 'authorized' : 'suspended'}</span><div class="row-actions">${admin.is_active ? `<button data-suspend-admin="${escape(admin.phone)}" data-tooltip="Suspend CR" aria-label="Suspend CR">${icon('suspend')}</button>` : `<button data-restore-admin="${escape(admin.phone)}" data-tooltip="Restore CR" aria-label="Restore CR">${icon('restore')}</button>`}<button data-remove="${escape(admin.phone)}" data-tooltip="Delete permanently" aria-label="Delete permanently">${icon('delete')}</button></div></div>`).join('') || emptyState('No CRs added', 'Owners configured in .env are always authorized.')}</section>`, 'CR')
    document.querySelector<HTMLButtonElement>('#new-admin')?.addEventListener('click', async () => { const phone = await promptDialog('Add CR', 'Phone number (digits only)'); if (!phone) return; const name = await promptDialog('Add CR', 'Display name', 'CR') || 'CR'; try { await api('/admins', { method: 'POST', body: JSON.stringify({ phone, name }) }); showToast('Number authorized'); adminsPage() } catch (err) { showToast(err instanceof Error ? err.message : 'Add failed', true) } })
    document.querySelectorAll<HTMLButtonElement>('[data-remove]').forEach(button => button.addEventListener('click', async () => { if (!await confirmDialog('Delete CR permanently', 'This permanently removes this WhatsApp control number.')) return; try { await api(`/admins/${encodeURIComponent(button.dataset.remove || '')}`, { method: 'DELETE' }); showToast('CR permanently deleted'); adminsPage() } catch (err) { showToast(err instanceof Error ? err.message : 'Remove failed', true) } }))
    document.querySelectorAll<HTMLButtonElement>('[data-suspend-admin]').forEach(button => button.addEventListener('click', async () => { try { await api(`/admins/${encodeURIComponent(button.dataset.suspendAdmin || '')}/status`, { method: 'PUT', body: JSON.stringify({ isActive: false }) }); showToast('Number suspended'); adminsPage() } catch (err) { showToast(err instanceof Error ? err.message : 'Suspend failed', true) } }))
    document.querySelectorAll<HTMLButtonElement>('[data-restore-admin]').forEach(button => button.addEventListener('click', async () => { try { await api(`/admins/${encodeURIComponent(button.dataset.restoreAdmin || '')}/status`, { method: 'PUT', body: JSON.stringify({ isActive: true }) }); showToast('Number restored'); adminsPage() } catch (err) { showToast(err instanceof Error ? err.message : 'Restore failed', true) } }))
  } catch (err) { showToast(err instanceof Error ? err.message : 'Could not load admins', true) }
}

void adminsPage

async function crManagementPage(): Promise<void> {
  layout('<div class="loading">Loading CR accounts…</div>', 'CR')
  try {
    const [usersResult, groupsResult] = await Promise.all([api<{ data: User[] }>('/users?role=cr'), api<{ data: Group[] }>('/groups')])
    const users = usersResult.data
    const groups = groupsResult.data
    layout(`<div class="page-toolbar"><p class="muted">CR accounts can manage events only in assigned groups. Their phone numbers are authorized automatically.</p><button id="new-cr" class="primary">+ Add CR</button></div><section class="panel table-panel"><div class="table-head"><span>CR</span><span>PHONE</span><span>GROUP ACCESS</span><span>STATUS</span><span>ACTIONS</span></div>${users.map(user => `<div class="table-row"><div><strong>${escape(user.display_name)}</strong><small>@${escape(user.username)}</small></div><span>${escape(user.phone || '—')}</span><span>${user.assigned_groups?.length ? user.assigned_groups.map(group => escape(group.name)).join(', ') : 'No groups assigned'}</span><span class="status ${user.is_active ? 'active' : 'cancelled'}">${user.is_active ? 'active' : 'suspended'}</span><div class="row-actions"><button data-cr-groups="${user.id}" data-tooltip="Assign groups" aria-label="Assign groups">${icon('groups')}</button>${user.is_active ? `<button data-cr-suspend="${user.id}" data-tooltip="Suspend CR" aria-label="Suspend CR">${icon('suspend')}</button>` : `<button data-cr-restore="${user.id}" data-tooltip="Restore CR" aria-label="Restore CR">${icon('restore')}</button>`}<button data-cr-delete="${user.id}" data-tooltip="Delete permanently" aria-label="Delete permanently">${icon('delete')}</button></div></div>`).join('') || emptyState('No CR accounts', 'Create a CR account to assign group access.')}</section>`, 'CR')
    document.querySelector<HTMLButtonElement>('#new-cr')?.addEventListener('click', () => userDialog('cr'))
    document.querySelectorAll<HTMLButtonElement>('[data-cr-groups]').forEach(button => button.addEventListener('click', async () => {
      const user = users.find(item => item.id === Number(button.dataset.crGroups))
      if (!user) return
      const selected = new Set((user.assigned_groups || []).map(group => group.jid))
      const dialog = document.createElement('dialog')
      dialog.innerHTML = `<form method="dialog" class="dialog-form group-assignment-dialog"><h2>Assign groups</h2><p class="muted">${escape(user.display_name)} currently has access to ${selected.size} group${selected.size === 1 ? '' : 's'}.</p><div class="group-picker">${groups.length ? groups.map(group => `<label class="group-option"><input type="checkbox" name="group" value="${escape(group.jid)}" ${selected.has(group.jid) ? 'checked' : ''}><span><strong>${escape(group.name)}</strong><small>${escape(group.alias ? `@${group.alias}` : group.jid)}</small></span></label>`).join('') : '<p class="muted">No groups are available. Sync groups first.</p>'}</div><div class="form-actions"><button type="button" class="secondary" data-close>Cancel</button><button class="primary" type="submit">Save access</button></div></form>`
      document.body.append(dialog)
      const close = () => { dialog.close(); dialog.remove() }
      dialog.querySelector('[data-close]')?.addEventListener('click', close)
      dialog.querySelector('form')?.addEventListener('submit', async event => {
        event.preventDefault()
        const groupJids = [...dialog.querySelectorAll<HTMLInputElement>('input[name="group"]:checked')].map(input => input.value)
        try {
          await api(`/users/${user.id}/groups`, { method: 'PUT', body: JSON.stringify({ groupJids }) })
          close()
          showToast('Group access updated')
          crManagementPage()
        } catch (err) { showToast(err instanceof Error ? err.message : 'Could not update groups', true) }
      })
      dialog.showModal()
    }))
    document.querySelectorAll<HTMLButtonElement>('[data-cr-suspend]').forEach(button => button.addEventListener('click', async () => { try { await api(`/users/${button.dataset.crSuspend}`, { method: 'DELETE' }); showToast('CR suspended'); crManagementPage() } catch (err) { showToast(err instanceof Error ? err.message : 'Suspend failed', true) } }))
    document.querySelectorAll<HTMLButtonElement>('[data-cr-restore]').forEach(button => button.addEventListener('click', async () => { try { await api(`/users/${button.dataset.crRestore}`, { method: 'PUT', body: JSON.stringify({ isActive: true }) }); showToast('CR restored'); crManagementPage() } catch (err) { showToast(err instanceof Error ? err.message : 'Restore failed', true) } }))
    document.querySelectorAll<HTMLButtonElement>('[data-cr-delete]').forEach(button => button.addEventListener('click', async () => { if (!await confirmDialog('Delete CR permanently', 'This permanently removes the CR account.')) return; try { await api(`/users/${button.dataset.crDelete}/permanent`, { method: 'DELETE' }); showToast('CR permanently deleted'); crManagementPage() } catch (err) { showToast(err instanceof Error ? err.message : 'Delete failed', true) } }))
    document.querySelector<HTMLButtonElement>('#new-admin')?.addEventListener('click', async () => { const phone = await promptDialog('Authorize WhatsApp number', 'Phone number (digits only)'); if (!phone) return; const name = await promptDialog('Authorize WhatsApp number', 'Display name', 'CR') || 'CR'; try { await api('/admins', { method: 'POST', body: JSON.stringify({ phone, name }) }); showToast('Number authorized'); crManagementPage() } catch (err) { showToast(err instanceof Error ? err.message : 'Add failed', true) } })
    document.querySelectorAll<HTMLButtonElement>('[data-remove]').forEach(button => button.addEventListener('click', async () => { if (!await confirmDialog('Delete WhatsApp number', 'This removes bot control for this number.')) return; try { await api(`/admins/${encodeURIComponent(button.dataset.remove || '')}`, { method: 'DELETE' }); showToast('Number removed'); crManagementPage() } catch (err) { showToast(err instanceof Error ? err.message : 'Remove failed', true) } }))
    document.querySelectorAll<HTMLButtonElement>('[data-suspend-admin]').forEach(button => button.addEventListener('click', async () => { try { await api(`/admins/${encodeURIComponent(button.dataset.suspendAdmin || '')}/status`, { method: 'PUT', body: JSON.stringify({ isActive: false }) }); showToast('Number suspended'); crManagementPage() } catch (err) { showToast(err instanceof Error ? err.message : 'Suspend failed', true) } }))
    document.querySelectorAll<HTMLButtonElement>('[data-restore-admin]').forEach(button => button.addEventListener('click', async () => { try { await api(`/admins/${encodeURIComponent(button.dataset.restoreAdmin || '')}/status`, { method: 'PUT', body: JSON.stringify({ isActive: true }) }); showToast('Number restored'); crManagementPage() } catch (err) { showToast(err instanceof Error ? err.message : 'Restore failed', true) } }))
  } catch (err) { showToast(err instanceof Error ? err.message : 'Could not load CR accounts', true) }
}

async function settingsPage(): Promise<void> {
  let messageTemplate = 'standard'
  try { messageTemplate = (await api<{ data: { messageTemplate: string } }>('/preferences/message-template')).data.messageTemplate } catch (err) { showToast(err instanceof Error ? err.message : 'Could not load preferences', true) }
  layout(`<section class="panel settings-panel"><p class="eyebrow">ACCOUNT</p><h2>${escape(currentUser?.display_name)}</h2><p class="muted">Signed in as @${escape(currentUser?.username)} with ${escape(currentUser?.role)} access.</p><hr><form id="template-form" class="password-form"><h3>Message template</h3><p class="muted">This preference is saved for your next events.</p><label>Message style<select name="messageTemplate"><option value="standard" ${messageTemplate === 'standard' ? 'selected' : ''}>Standard — complete announcement</option><option value="compact" ${messageTemplate === 'compact' ? 'selected' : ''}>Compact — tighter spacing</option><option value="minimal" ${messageTemplate === 'minimal' ? 'selected' : ''}>Minimal — plain and short</option></select></label><button class="primary" type="submit">Save template</button></form><hr><form id="password-form" class="password-form"><h3>Change password</h3><label>Current password<input name="currentPassword" type="password" required></label><label>New password<input name="newPassword" type="password" minlength="6" required></label><button class="primary" type="submit">Update password</button></form></section>`, 'Settings')
  document.querySelector<HTMLFormElement>('#template-form')!.addEventListener('submit', async event => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement)); try { await api('/preferences/message-template', { method: 'PUT', body: JSON.stringify(data) }); showToast('Message template saved') } catch (err) { showToast(err instanceof Error ? err.message : 'Could not save template', true) } })
  document.querySelector<HTMLFormElement>('#password-form')!.addEventListener('submit', async event => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement)); try { await api('/auth/change-password', { method: 'POST', body: JSON.stringify(data) }); showToast('Password updated'); (event.currentTarget as HTMLFormElement).reset() } catch (err) { showToast(err instanceof Error ? err.message : 'Update failed', true) } })
}

function render(): void {
  if (!token || !currentUser) { loginPage(); return }
  if (path === '/') { dashboard(); return }
  if (path === '/events') { eventsPage(); return }
  if (path === '/events/new') { eventForm(); return }
  if (path.match(/^\/events\/\d+\/edit$/)) { eventForm(path.split('/')[2]); return }
  if (path === '/groups') { groupsPage(); return }
  if (path === '/users') { if (currentUser?.role === 'super_admin') usersPage(); else navigate('/'); return }
  if (path === '/wa-admins') { if (currentUser?.role === 'super_admin' || currentUser?.role === 'admin') crManagementPage(); else navigate('/'); return }
  if (path === '/settings') { settingsPage(); return }
  navigate('/')
}

window.addEventListener('popstate', () => { path = window.location.pathname; render() })
render()
