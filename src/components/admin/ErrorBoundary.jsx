import { Component } from "react"

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo })
    // Log full error to console for debugging
    console.error("ErrorBoundary caught:", error, errorInfo)
  }

  render() {
    if (this.state.error) {
      const msg = this.state.error?.message || String(this.state.error)
      return (
        <div style={{ padding: "2rem", margin: "1rem", border: "2px solid #ef4444", borderRadius: "1rem", background: "#fef2f2" }}>
          <h2 style={{ color: "#dc2626", marginBottom: "0.5rem" }}>Render Error</h2>
          <pre style={{ fontSize: "0.8rem", whiteSpace: "pre-wrap", background: "#fff", padding: "1rem", borderRadius: "0.5rem", border: "1px solid #fecaca", maxHeight: "80vh", overflow: "auto" }}>
{msg}

Component stack:
{this.state.errorInfo?.componentStack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}
