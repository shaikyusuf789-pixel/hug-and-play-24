DELETE FROM scripts 
WHERE idea_id IS NOT NULL 
AND id NOT IN (
    SELECT DISTINCT ON (idea_id) id 
    FROM scripts 
    WHERE idea_id IS NOT NULL 
    ORDER BY idea_id, updated_at DESC
);