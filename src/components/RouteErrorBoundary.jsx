import { Component } from 'react'

export default class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error(`[${this.props.name || 'Route'} Error]`, error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="glass-panel p-6 m-4 text-center">
          <span className="material-symbols-outlined text-4xl text-red-400 mb-3 block">error_outline</span>
          <h3 className="font-headline text-lg text-on-surface mb-2">
            Something went wrong
          </h3>
          <p className="font-label text-sm text-on-surface-variant mb-4">
            {this.state.error.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 bg-primary text-on-primary rounded-xl font-label text-sm hover:opacity-90 transition-opacity"
          >
            Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
