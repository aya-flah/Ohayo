import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Keeps a crash in one page from blanking the whole app: shows what happened and a way back. */
export class PageErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page crashed', error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="glass glass-edge mx-auto mt-10 max-w-[520px] rounded-[24px] p-6">
        <h2 className="text-[19px] font-extrabold">This page stopped working</h2>
        <p className="mt-1.5 text-[14.5px] text-ink-2">Something on this page failed to display. Your data is safe. Reload the page to continue.</p>
        <p className="num mt-2 text-[12.5px] text-ink-2">{this.state.error.message}</p>
        <div className="mt-4 flex gap-2">
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
          <button className="btn" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      </div>
    );
  }
}
