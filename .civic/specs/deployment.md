# 🚀 CivicPress Spec: `deployment.md`

## 📛 Name

`deployment` — CivicPress Deployment Patterns & Strategies

## 🎯 Purpose

Define how to deploy CivicPress in local, demo, and production environments
using subdomains, ports, and standard HTTP infrastructure (e.g., Nginx,
systemd).

---

## 🧩 Deployment Philosophy

CivicPress favors:

- Clear separation of services (UI, API, admin)
- Transparent routing (no black-box containers required)
- Developer-friendly debugging and service access
- Realistic hosting for small towns and local governments

---

## 🧪 Local & Demo Setup (Ports)

For local or lightweight demos:

| Service     | URL/Port                | Description               |
| ----------- | ----------------------- | ------------------------- |
| Public UI   | `http://localhost:3000` | Nuxt civic portal         |
| API Backend | `http://localhost:3030` | Express or Hono server    |
| Admin UI    | `http://localhost:3100` | Optional management layer |

✅ Simple to run and debug  
✅ No Docker or domain config required  
✅ No route collision: different ports = different namespaces

---

## 🌐 Production Setup (Subdomains + Reverse Proxy)

| Subdomain       | Target Port        |
| --------------- | ------------------ |
| `app.town.ca`   | → `localhost:3000` |
| `api.town.ca`   | → `localhost:3030` |
| `admin.town.ca` | → `localhost:3100` |

Use Nginx or Caddy to map subdomains to internal ports.

### Example Nginx Snippet

```nginx
server {
    listen 80;
    server_name api.town.ca;
    location / {
        proxy_pass http://localhost:3030;
    }
}
```

🧠 Proxies ensure that:

- You avoid naming collisions
- All services can share the same machine
- Public URLs remain clean and stable

---

## 🔐 HTTPS & Security

- Add HTTPS using Let's Encrypt (Certbot)
- Restrict `admin.` subdomain by IP or GitHub login
- Add `health.` checks for uptime monitoring

---

## 🛠️ CLI Integration

- `civic index` can be called by `cron` or webhook
- `civic serve` may offer static fallback or preview mode
- All services can run under `systemd`, `pm2`, or `forever`

---

## 🧪 Testing & Validation

- Test local deployment with multiple ports
- Verify subdomain routing works correctly
- Test HTTPS configuration and certificates
- Ensure proper service isolation
- Validate health check endpoints

---

## 🛠️ Future Enhancements

- Federation-ready multi-tenant proxy
- System-wide `civicctl` deployment CLI
- Webhooks from GitHub → `api.town.ca/hook/publish`
- SSO proxy with Civic ID or OpenID

---

## 🔐 Routing Guarantees

Using distinct ports for each service ensures complete separation with no route
collisions:

- `localhost:3000/bylaws/curfew` (UI)
- `localhost:3030/bylaws/curfew` (API)
- `localhost:3100/bylaws/curfew` (Admin)

Each runs on its own TCP socket. Even with identical routes, the port makes each
service independent and safe.

This pattern scales well to local, demo, and production deployments, and is
ideal for subdomain proxying.

---

## 🧭 CivicPress Deployment Philosophy (Final)

### ✅ Subdomain-based Services (Preferred)

CivicPress recommends deploying services via subdomains for modularity,
isolation, and scale:

| Service     | Subdomain       | Description                      |
| ----------- | --------------- | -------------------------------- |
| Public UI   | `app.town.ca`   | Civic portal and records viewer  |
| API Backend | `api.town.ca`   | REST API for actions and queries |
| Admin Panel | `admin.town.ca` | Optional management interface    |

This strategy:

- Prevents all route collisions
- Enables per-service autoscaling
- Feels natural for public infrastructure (`api.city.ca`, `app.city.ca`)
- Works with cloud platforms (AWS, Fly.io, Heroku)

### 🔁 Port-based Routing (Local & Fallback)

For development, demos, or low-resource deployment (USB stick, town laptop):

| Service     | Port             |
| ----------- | ---------------- |
| Public UI   | `localhost:3000` |
| API Backend | `localhost:3030` |
| Admin UI    | `localhost:3100` |

This strategy:

- Requires no DNS or Docker
- Works in offline or airgapped environments
- Easy to teach and debug

---

## 🧱 Summary Table

| Use Case              | Strategy              | Routing Example                |
| --------------------- | --------------------- | ------------------------------ |
| Local development     | Multi-port            | `localhost:3000`, `:3030`      |
| Demo deployments      | Multi-port            | Same as above                  |
| Small towns (offline) | Multi-port or kiosk   | USB + localhost                |
| Cloud deployment      | Subdomain + autoscale | `app.town.ca`, `api.town.ca`   |
| Federation (future)   | Subdomain routing     | `api.civicpress.org/towns/:id` |

✅ This approach ensures clean, safe, modular civic infrastructure at every
scale.

---

## 📅 History

- Drafted: 2025-07-03
