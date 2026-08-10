/**
 * Creation-site cleanup: every subscription registers its teardown where it is
 * made, and `dispose()` just unwinds the list. Newest-first, because a later
 * registration may depend on an earlier one still being alive as it tears down.
 */
export class Disposer {
  private readonly teardowns: Array<() => void> = []

  add(teardown: () => void): void {
    this.teardowns.push(teardown)
  }

  dispose(): void {
    for (let index = this.teardowns.length - 1; index >= 0; index--) {
      this.teardowns[index]()
    }
    this.teardowns.length = 0
  }
}
