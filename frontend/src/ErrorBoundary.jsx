import React from "react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    // Keep a trace in console for debugging while preserving UI during demos.
    console.error("ErrorBoundary caught an error:", error);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-card" role="alert">
          <h3>Something went wrong in this section.</h3>
          <p>Try again without reloading the entire app.</p>
          <button type="button" onClick={this.handleRetry}>
            Retry Section
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
