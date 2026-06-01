WITH ranked AS (
  SELECT id, idea_id,
    ROW_NUMBER() OVER (PARTITION BY idea_id ORDER BY updated_at DESC NULLS LAST, created_at DESC) AS rn
  FROM public.scripts
  WHERE content IS NOT NULL AND content <> ''
)
DELETE FROM public.scripts WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Also clean empty-content scripts that have a sibling with content for the same idea
DELETE FROM public.scripts s
WHERE (s.content IS NULL OR s.content = '')
  AND EXISTS (
    SELECT 1 FROM public.scripts s2
    WHERE s2.idea_id = s.idea_id AND s2.id <> s.id AND s2.content IS NOT NULL AND s2.content <> ''
  );