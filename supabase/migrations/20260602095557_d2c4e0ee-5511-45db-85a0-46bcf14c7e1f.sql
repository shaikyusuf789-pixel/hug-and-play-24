DELETE FROM ocr_results        WHERE script_id='57953a7e-7ded-417e-a54d-bd80d895b92d' AND chunk_number=1;
DELETE FROM audio_timestamps   WHERE script_id='57953a7e-7ded-417e-a54d-bd80d895b92d' AND chunk_number=1;
DELETE FROM clip_annotations   WHERE script_id='57953a7e-7ded-417e-a54d-bd80d895b92d' AND chunk_number=1;
DELETE FROM video_clips        WHERE script_id='57953a7e-7ded-417e-a54d-bd80d895b92d' AND chunk_number=1;