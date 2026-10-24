import { Component, type ReactNode } from "react";
// Each section gets its own boundary so one broken part never blanks the whole screen.
export default class Boundary extends Component<
  { name: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="banner bad" role="alert">
        The {this.props.name} section hit a problem.{" "}
        <button onClick={() => this.setState({ failed: false })}>
          Try again
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
