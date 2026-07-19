-- Make the one retained unread publish notice immediately useful to players.
-- Historical records remain available as read-only history.

UPDATE notifications
SET title = 'Practice media updated',
    body = 'Your latest diagrams and videos are ready. Open Practice to review.'
WHERE type = 'media_update'
  AND read_at IS NULL;

UPDATE notifications
SET title = CASE
      WHEN title LIKE 'Coach published %' THEN 'Practice ready: ' || substr(title, length('Coach published ') + 1)
      ELSE title
    END,
    body = 'Open it to review your calls, signals, and quiz work.'
WHERE type = 'script_published'
  AND read_at IS NULL;
