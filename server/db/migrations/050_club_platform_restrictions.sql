ALTER TABLE clubs ADD COLUMN platform_restricted boolean NOT NULL DEFAULT false;
-- Reconstruct a hold for any already-recorded platform removal decision.
UPDATE clubs c SET platform_restricted=true,state='archived'
WHERE c.state<>'deleted' AND EXISTS (
 SELECT 1 FROM moderation_actions a WHERE a.target_type='club' AND a.target_id=c.id AND a.action='remove'
 AND NOT EXISTS (SELECT 1 FROM moderation_actions r WHERE r.target_type='club' AND r.target_id=c.id AND r.action='restore' AND r.created_at>a.created_at)
);
