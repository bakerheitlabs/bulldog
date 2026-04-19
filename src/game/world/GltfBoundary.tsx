import { Component, Suspense, type ReactNode } from 'react';

type Props = { fallback: ReactNode; children: ReactNode };
type State = { hasError: boolean };

export default class GltfBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('[GltfBoundary] falling back to primitive:', error);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return <Suspense fallback={this.props.fallback}>{this.props.children}</Suspense>;
  }
}
