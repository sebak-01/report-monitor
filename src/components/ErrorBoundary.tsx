import { Component, type ErrorInfo, type ReactNode } from 'react';
import { de } from '../i18n/de';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Keeps a broken dataset from blanking the whole dashboard. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Dashboard error', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="page">
          <p role="alert">
            {de.renderError} <span className="muted">({this.state.error.message})</span>
          </p>
          <p>
            <a href="#/upload">{de.upload.link}</a>
          </p>
        </main>
      );
    }
    return this.props.children;
  }
}
