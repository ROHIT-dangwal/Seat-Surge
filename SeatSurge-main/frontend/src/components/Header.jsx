function Header({ authed, onLogout }) {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
        <span className="text-lg font-extrabold tracking-tight text-slate-900">
          Seat<span className="text-indigo-600">Surge</span>
        </span>
        {authed && (
          <button
            onClick={onLogout}
            className="text-sm font-medium text-slate-400 transition hover:text-slate-700"
          >
            Log out
          </button>
        )}
      </div>
    </header>
  )
}

export default Header
