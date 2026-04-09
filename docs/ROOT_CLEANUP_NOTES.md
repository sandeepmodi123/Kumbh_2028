# Root Cleanup Notes

## Cleanup Status

Cleanup has been applied.

Removed items:

1. `face_approch/`
2. `files.zip`
3. `start.log`
4. `kumbh_system/server-v2-complete.js`

Remaining support item:

1. `docs/briefs/plans/`
- Contains planning HTML files (`plan_v2.html`, `plan_v3.html`, `plan_v4.html`, etc.).
- Not required for runtime, but still useful as architecture reference.

## Recommended Clean Runtime Mental Model

### Production/demo runtime path
- Use only `kumbh_system/`

### Presentation/docs path
- Use only `docs/`

### Optional future cleanup candidate
- `docs/briefs/plans/` (only if you no longer need planning references)

## Recommendation

Current structure is already clean for demo use:
- Runtime: `kumbh_system/`
- Documentation: `docs/`
