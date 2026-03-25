import { signal } from "@pyreon/reactivity"

export type Notification = {
  id: number
  message: string
  type: "info" | "success" | "danger"
}

let notifId = 0
export const notifications = signal<Notification[]>([])

export function addNotification(message: string, type: Notification["type"] = "info") {
  const id = ++notifId
  notifications.set([...notifications(), { id, message, type }])
  setTimeout(() => removeNotification(id), 4000)
}

export function removeNotification(id: number) {
  notifications.set(notifications().filter((n) => n.id !== id))
}
