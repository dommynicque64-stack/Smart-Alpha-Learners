# Smart Alpha Learners — Production Audit Notes

This package contains targeted hardening changes identified during the production-readiness audit.

## Changes applied
- Removed silent localhost Supabase fallback from `api/db-client.js`.
- Removed Design Arena/rrweb recording, page-view telemetry, and element-picker injection from the production HTML entrypoint.
- Removed the Vite source-tag plugin loading from the production Vite config.
- Added configurable CORS origin support via `APP_ORIGIN` instead of `*`.
- Super Admin theme visibility now recognizes both `Super Admin` and the schema-seeded `Administrator` role.
- Client/server dashboard date helpers now use `Africa/Nairobi` for date-only calculations.
- Replaced one remaining gradient badge with a solid color.

## Additional deployment hardening
- Node.js 22.12.x is pinned for consistent Netlify/Vite builds.
- CORS no longer reflects arbitrary request origins when `APP_ORIGIN` is missing.
- School reads/updates are scoped to the authenticated user's `school_id`; first-time setup attaches the bootstrap administrator to the newly created school.

## Important unresolved blockers
This project is **not yet certified production-ready**. The audit found database/API authorization and schema-contract issues that require a controlled database migration and authenticated multi-school testing before deployment. See the audit report in the ChatGPT response for details.
