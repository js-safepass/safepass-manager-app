import { Component } from 'react';
import { flattenErrorForLog } from '../../lib/errorLog.js';

// Last-resort catch for render-time crashes. Anything reaching here is a
// bug — flows own their own error states via getUserFacingError; this only
// prevents a white screen and gives staff a way to recover.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled render error', flattenErrorForLog(error), info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h1>Something went wrong</h1>
          <p>Reload the app to continue. If this keeps happening, contact support.</p>
          <button className="cta" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
