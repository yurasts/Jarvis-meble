import { Component } from 'react'
import s from './AppErrorBoundary.module.css'

const COPY = {
  title: 'Co\u015b posz\u0142o nie tak',
  message: 'Od\u015bwie\u017c stron\u0119. Je\u015bli problem si\u0119 powt\u00f3rzy, skontaktuj si\u0119 z administratorem.',
  reload: 'Od\u015bwie\u017c stron\u0119',
}

export default class AppErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled application error', error, info)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <main className={s.page} role="alert">
        <section className={s.card}>
          <h1>{COPY.title}</h1>
          <p>{COPY.message}</p>
          <button type="button" onClick={this.handleReload}>{COPY.reload}</button>
        </section>
      </main>
    )
  }
}
