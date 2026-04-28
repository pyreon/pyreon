import { useHead } from "@pyreon/head"
import { listUsers } from "../../lib/db"

export const meta = { title: "Users" }

export default function Users() {
  useHead({ title: meta.title })

  const users = listUsers()

  return (
    <>
      <div class="app-page-header">
        <h1>Users</h1>
        <button class="btn btn-primary">Invite user</button>
      </div>

      <table class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr>
              <td>{u.name}</td>
              <td>{u.email}</td>
              <td>
                <span class="pill">{u.role}</span>
              </td>
              <td>{u.createdAt.toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
