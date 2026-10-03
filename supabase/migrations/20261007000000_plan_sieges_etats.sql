-- ============================================================
-- Plan de sièges : distinguer « vendu » et « temporairement bloqué » (7 octobre 2026)
-- Lecture seule : ajoute les listes booked / held au détail d'un départ ('taken' inchangé).
-- ============================================================
begin;

create or replace function public.nzk_trip_detail(p_trip uuid, p_from text, p_to text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v jsonb; v_max int;
begin
  perform public.nzk_purge_holds(p_trip);
  select jsonb_build_object(
    'trip_id', tr.id, 'date', tr.date, 'departure_time', tr.departure_time, 'direction', tr.direction,
    'status', tr.status, 'corridor_id', sv.corridor_id, 'corridor_label', c.label,
    'bus', jsonb_build_object('name', b.name, 'type', b.bus_type, 'seats_per_row', b.seats_per_row,
                              'rows', b.rows, 'back_row_seats', b.back_row_seats, 'amenities', b.amenities),
    'price', public.nzk_segment_price(sv.corridor_id, p_from, p_to),
    'premium_supplement', public.nzk_premium_supplement(),
    'from_offset', f.offset_minutes, 'to_offset', tt.offset_minutes,
    'max_offset', (select max(offset_minutes) from public.corridor_stops x where x.corridor_id = sv.corridor_id),
    'from_order', f.stop_order, 'to_order', tt.stop_order,
    'taken', coalesce((select jsonb_agg(ts.seat_number) from public.trip_seats ts
                       where ts.trip_id = tr.id and (ts.status = 'booked' or ts.expires_at > now())), '[]'::jsonb),
    'booked', coalesce((select jsonb_agg(ts.seat_number) from public.trip_seats ts
                        where ts.trip_id = tr.id and ts.status = 'booked'), '[]'::jsonb),
    'held', coalesce((select jsonb_agg(ts.seat_number) from public.trip_seats ts
                      where ts.trip_id = tr.id and ts.status = 'hold' and ts.expires_at > now()), '[]'::jsonb)
  ) into v
  from public.trips tr
  join public.services sv on sv.id = tr.service_id
  join public.corridors c on c.id = sv.corridor_id
  join public.buses b on b.id = coalesce(tr.bus_id, sv.bus_id)
  join public.corridor_stops f on f.corridor_id = sv.corridor_id and f.city_id = p_from
  join public.corridor_stops tt on tt.corridor_id = sv.corridor_id and tt.city_id = p_to
  where tr.id = p_trip;
  return v;  -- null si départ inconnu ou tronçon hors corridor
end $$;

revoke all on function public.nzk_trip_detail(uuid, text, text) from public, anon, authenticated;
grant execute on function public.nzk_trip_detail(uuid, text, text) to service_role;

commit;
