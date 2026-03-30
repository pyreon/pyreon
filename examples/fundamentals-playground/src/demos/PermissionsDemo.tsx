import { createPermissions } from "@pyreon/permissions";
import { effect, signal } from "@pyreon/reactivity";

// Role → permissions mapping
function fromRole(role: string): Record<string, boolean | ((ctx?: any) => boolean)> {
  const currentUserId = "user-42";
  const roles: Record<string, Record<string, boolean | ((ctx?: any) => boolean)>> = {
    admin: { "*": true },
    editor: {
      "posts.read": true,
      "posts.create": true,
      "posts.update": (post?: any) => !post || post.authorId === currentUserId,
      "posts.delete": (post?: any) => !post || post.authorId === currentUserId,
      "posts.publish": true,
      "users.read": true,
      "comments.*": true,
      "feature.new-editor": true,
    },
    viewer: {
      "posts.read": true,
      "comments.read": true,
      "users.read": true,
    },
  };
  return roles[role] ?? {};
}

const can = createPermissions(fromRole("editor"));
const currentRole = signal("editor");

// Sync role changes to permissions
effect(() => {
  can.set(fromRole(currentRole()));
});

// Sample posts
const posts = [
  {
    id: 1,
    title: "Getting Started with Pyreon",
    authorId: "user-42",
    status: "published",
  },
  {
    id: 2,
    title: "Advanced Signal Patterns",
    authorId: "user-42",
    status: "draft",
  },
  {
    id: 3,
    title: "Building Dashboards",
    authorId: "user-99",
    status: "published",
  },
  {
    id: 4,
    title: "State Management Deep Dive",
    authorId: "user-99",
    status: "draft",
  },
];

export function PermissionsDemo() {
  const log = signal<string[]>([]);
  const addLog = (msg: string) => log.update((l) => [...l.slice(-9), msg]);

  return (
    <div>
      <h2>Permissions</h2>
      <p class="desc">
        Reactive type-safe permissions — universal (RBAC, ABAC, feature flags). Permissions are
        booleans or predicates. <code>can()</code> is reactive in effects and JSX.
      </p>

      <div class="section">
        <h3>Role Selector</h3>
        <div class="row">
          {["admin", "editor", "viewer"].map((role) => (
            <button
              type="button"
              key={role}
              class={currentRole() === role ? "active" : ""}
              onClick={() => {
                currentRole.set(role);
                addLog(`Role changed to ${role}`);
              }}
            >
              {role.charAt(0).toUpperCase() + role.slice(1)}
            </button>
          ))}
        </div>
        <p>
          Current role: <strong>{() => currentRole()}</strong>
        </p>
      </div>

      <div class="section">
        <h3>Permission Checks (Reactive)</h3>
        <table style="width: 100%; border-collapse: collapse">
          <thead>
            <tr>
              <th style="text-align: left; padding: 4px 8px; border-bottom: 1px solid #ddd">
                Permission
              </th>
              <th style="text-align: left; padding: 4px 8px; border-bottom: 1px solid #ddd">
                Granted?
              </th>
            </tr>
          </thead>
          <tbody>
            {[
              "posts.read",
              "posts.create",
              "posts.publish",
              "posts.delete",
              "users.read",
              "users.manage",
              "comments.read",
              "comments.create",
              "billing.export",
              "feature.new-editor",
            ].map((perm) => (
              <tr key={perm}>
                <td style="padding: 4px 8px; font-family: monospace; font-size: 13px">{perm}</td>
                <td style="padding: 4px 8px">
                  {() => (
                    <span style={`color: ${can(perm) ? "green" : "red"}; font-weight: bold`}>
                      {can(perm) ? "Yes" : "No"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div class="section">
        <h3>Instance-Level Checks (Ownership)</h3>
        <p style="margin-bottom: 8px; font-size: 13px; opacity: 0.7">
          Current user: <code>user-42</code>. Editor can only update/delete own posts.
        </p>
        <table style="width: 100%; border-collapse: collapse">
          <thead>
            <tr>
              <th style="text-align: left; padding: 4px 8px; border-bottom: 1px solid #ddd">
                Post
              </th>
              <th style="text-align: left; padding: 4px 8px; border-bottom: 1px solid #ddd">
                Author
              </th>
              <th style="text-align: center; padding: 4px 8px; border-bottom: 1px solid #ddd">
                Can Edit
              </th>
              <th style="text-align: center; padding: 4px 8px; border-bottom: 1px solid #ddd">
                Can Delete
              </th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr key={post.id}>
                <td style="padding: 4px 8px; font-size: 13px">{post.title}</td>
                <td style="padding: 4px 8px; font-family: monospace; font-size: 12px">
                  {post.authorId}
                </td>
                <td style="padding: 4px 8px; text-align: center">
                  {() => (
                    <span style={`color: ${can("posts.update", post) ? "green" : "red"}`}>
                      {can("posts.update", post) ? "Yes" : "No"}
                    </span>
                  )}
                </td>
                <td style="padding: 4px 8px; text-align: center">
                  {() => (
                    <span style={`color: ${can("posts.delete", post) ? "green" : "red"}`}>
                      {can("posts.delete", post) ? "Yes" : "No"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div class="section">
        <h3>Combinators</h3>
        <p>
          <code>can.all('posts.read', 'posts.create')</code>:{" "}
          <strong>{() => (can.all("posts.read", "posts.create") ? "true" : "false")}</strong>
        </p>
        <p>
          <code>can.any('billing.export', 'feature.new-editor')</code>:{" "}
          <strong>
            {() => (can.any("billing.export", "feature.new-editor") ? "true" : "false")}
          </strong>
        </p>
        <p>
          <code>can.not('billing.export')</code>:{" "}
          <strong>{() => (can.not("billing.export") ? "true" : "false")}</strong>
        </p>
      </div>

      <div class="section">
        <h3>Wildcard Matching</h3>
        <p style="font-size: 13px; opacity: 0.7; margin-bottom: 4px">
          Editor has <code>comments.*</code> — matches any comments action:
        </p>
        <p>
          <code>can('comments.read')</code>:{" "}
          <strong>{() => (can("comments.read") ? "true" : "false")}</strong>
        </p>
        <p>
          <code>can('comments.create')</code>:{" "}
          <strong>{() => (can("comments.create") ? "true" : "false")}</strong>
        </p>
        <p>
          <code>can('comments.delete')</code>:{" "}
          <strong>{() => (can("comments.delete") ? "true" : "false")}</strong>
        </p>
      </div>

      <div class="section">
        <h3>Introspection — Granted Keys</h3>
        <pre style="font-size: 12px; max-height: 150px; overflow-y: auto">
          {() => JSON.stringify(can.granted(), null, 2)}
        </pre>
      </div>

      <div class="section">
        <h3>Patch — Runtime Updates</h3>
        <div class="row">
          <button
            type="button"
            onClick={() => {
              can.patch({ "billing.export": true });
              addLog("Patched: billing.export → true");
            }}
          >
            Grant billing.export
          </button>
          <button
            type="button"
            onClick={() => {
              can.patch({ "feature.new-editor": false });
              addLog("Patched: feature.new-editor → false");
            }}
          >
            Revoke feature.new-editor
          </button>
          <button
            type="button"
            onClick={() => {
              can.set(fromRole(currentRole()));
              addLog("Reset to role defaults");
            }}
          >
            Reset
          </button>
        </div>
      </div>

      <div class="section">
        <h3>Change Log</h3>
        <div class="log">
          {() =>
            log().length === 0
              ? "Switch roles or patch permissions to see changes."
              : log().join("\n")
          }
        </div>
      </div>
    </div>
  );
}
