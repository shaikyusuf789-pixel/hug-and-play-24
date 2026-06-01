
insert into storage.buckets (id, name, public) values
  ('audio-files', 'audio-files', true),
  ('slides', 'slides', true),
  ('user-uploads', 'user-uploads', true)
on conflict (id) do nothing;

create policy "Public read audio-files" on storage.objects for select using (bucket_id = 'audio-files');
create policy "Auth write audio-files" on storage.objects for insert to authenticated with check (bucket_id = 'audio-files');
create policy "Service write audio-files" on storage.objects for insert to service_role with check (bucket_id = 'audio-files');
create policy "Service update audio-files" on storage.objects for update to service_role using (bucket_id = 'audio-files');
create policy "Service delete audio-files" on storage.objects for delete to service_role using (bucket_id = 'audio-files');

create policy "Public read slides" on storage.objects for select using (bucket_id = 'slides');
create policy "Auth write slides" on storage.objects for insert to authenticated with check (bucket_id = 'slides');
create policy "Service write slides" on storage.objects for insert to service_role with check (bucket_id = 'slides');
create policy "Service update slides" on storage.objects for update to service_role using (bucket_id = 'slides');
create policy "Service delete slides" on storage.objects for delete to service_role using (bucket_id = 'slides');

create policy "Public read user-uploads" on storage.objects for select using (bucket_id = 'user-uploads');
create policy "Auth write user-uploads" on storage.objects for insert to authenticated with check (bucket_id = 'user-uploads');
create policy "Auth update user-uploads" on storage.objects for update to authenticated using (bucket_id = 'user-uploads');
create policy "Auth delete user-uploads" on storage.objects for delete to authenticated using (bucket_id = 'user-uploads');
