# Rig Ledger

A full-stack fleet management system built for trucking companies to manage their vehicles, track maintenance schedules, and monitor expenses — all in one place.

## Features

- **Authentication** — User registration and login with JWT-based session management
- **Fleet Management** — Add, edit, and delete trucks with detailed vehicle information
- **Maintenance Tracking** — Dashboard alerts for upcoming and overdue service intervals (oil changes, inspections, tire rotations, fluid services)
- **Tire Tracking** — Per-position tire data including tread depth measurements
- **Expense Management** — Track fuel, maintenance, and income expenses per truck with chart visualizations

## Tech Stack

**Backend**
- Go with [Gin](https://github.com/gin-gonic/gin) web framework
- MongoDB for data storage
- JWT authentication with bcrypt password hashing

**Frontend**
- React 19 + TypeScript
- Vite for fast development and builds
- React Router DOM for client-side routing
- Axios for API communication
- Recharts for expense data visualizations

## Maintenance Intervals

The dashboard tracks the following service intervals:

| Service | Interval |
|---------|----------|
| Annual Inspection | 365 days |
| Brake Inspection | 365 days |
| Oil Change | 90 days |
| Coolant Flush | 730 days |
| Transmission Service | 365 days |
| Tire Rotation | 180 days |
