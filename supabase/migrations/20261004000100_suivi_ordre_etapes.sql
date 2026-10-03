-- Suivi public : ordre des étapes stable même si plusieurs étapes ont la même heure
create or replace function public.nzk_parcel_track_order(p_status text)
returns int language sql immutable as $$
  select array_position(array['depose','en_transit','arrive','pret_au_retrait','retire','annule'], p_status)
$$;

create or replace function public.nzk_parcel_track(p_reference text, p_phone4 text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare pc record; v_from text; v_to text; v_public text;
begin
  select * into pc from public.parcels where reference = upper(trim(coalesce(p_reference, ''))) for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'INTROUVABLE'); end if;
  if pc.track_locked_until is not null and pc.track_locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'TROP_DE_TENTATIVES');
  end if;
  if coalesce(p_phone4, '') !~ '^\d{4}$'
     or (right(public.nzk_digits(pc.sender_phone), 4) <> p_phone4 and right(public.nzk_digits(pc.recipient_phone), 4) <> p_phone4) then
    update public.parcels set track_failed_attempts = track_failed_attempts + 1,
           track_locked_until = case when track_failed_attempts + 1 >= 10 then now() + interval '1 hour' else null end
    where id = pc.id;
    return jsonb_build_object('ok', false, 'error', 'INTROUVABLE');
  end if;
  update public.parcels set track_failed_attempts = 0, track_locked_until = null where id = pc.id and track_failed_attempts > 0;

  v_from := (select name from public.cities where id = pc.from_city);
  v_to := (select name from public.cities where id = pc.to_city);
  v_public := case pc.status
    when 'depose' then 'depose' when 'affecte' then 'depose' when 'charge' then 'depose'
    when 'en_transit' then 'en_transit' when 'arrive' then 'arrive' when 'pret_au_retrait' then 'pret_au_retrait'
    when 'retire' then 'retire' when 'annule' then 'annule' else 'verification' end;

  return jsonb_build_object(
    'ok', true, 'reference', pc.reference, 'status', v_public, 'from_city', v_from, 'to_city', v_to,
    'to_terminal', (select name from public.terminals where id = pc.to_terminal),
    'payment_due', pc.payment_status = 'a_payer' and pc.status not in ('retire', 'annule'),
    'timeline', coalesce((
      select jsonb_agg(jsonb_build_object('status', s.st, 'at', s.at) order by s.at, public.nzk_parcel_track_order(s.st))
      from (
        select distinct on (st) st, at from (
          select case e.to_status
                   when 'depose' then 'depose' when 'en_transit' then 'en_transit' when 'arrive' then 'arrive'
                   when 'pret_au_retrait' then 'pret_au_retrait' when 'retire' then 'retire' when 'annule' then 'annule'
                 end as st, e.created_at as at
          from public.parcel_events e where e.parcel_id = pc.id
        ) x where st is not null order by st, at
      ) s), '[]'::jsonb)
  );
end $$;
revoke all on function public.nzk_parcel_track(text, text) from public, anon, authenticated;
grant execute on function public.nzk_parcel_track(text, text) to service_role;
