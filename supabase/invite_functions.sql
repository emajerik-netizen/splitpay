-- ============================================================
-- SPLITPAY: Invite functions for cross-user trip joining
-- Run these in your Supabase SQL editor
-- ============================================================

-- 1. Look up basic trip info by invite code (requires auth)
--    Returns: trip name + list of available (unfilled) slots
CREATE OR REPLACE FUNCTION lookup_trip_by_invite_code(p_invite_code TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  SELECT trip_elem.value INTO v_trip
  FROM trip_states ts,
       jsonb_array_elements(ts.state_json->'trips') trip_elem
  WHERE trip_elem.value->>'inviteCode' = p_invite_code
  LIMIT 1;

  IF v_trip IS NULL THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  RETURN json_build_object(
    'found', true,
    'tripId',       v_trip->>'id',
    'tripName',     v_trip->>'name',
    'pendingSlots', COALESCE(
      (
        SELECT jsonb_agg(invite->>'name')
        FROM jsonb_array_elements(COALESCE(v_trip->'pendingInvites', '[]'::jsonb)) invite
        WHERE invite->>'status' = 'Pozvany'
      ),
      '[]'::jsonb
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION lookup_trip_by_invite_code TO authenticated;


-- 2. Join a trip by invite code (requires auth)
--    - Adds member to owner's trip
--    - Copies trip to joining user's trip_states
--    - Marks matching pending invite as accepted
CREATE OR REPLACE FUNCTION join_trip_by_invite_code(p_invite_code TEXT, p_member_name TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_user_id   UUID;
  v_trip            JSONB;
  v_joining_user_id UUID;
  v_member_exists   BOOLEAN;
  v_has_slot        BOOLEAN;
  v_updated_trip    JSONB;
BEGIN
  v_joining_user_id := auth.uid();
  IF v_joining_user_id IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  -- Find trip across all users
  SELECT ts.user_id, trip_elem.value
  INTO   v_owner_user_id, v_trip
  FROM   trip_states ts,
         jsonb_array_elements(ts.state_json->'trips') trip_elem
  WHERE  trip_elem.value->>'inviteCode' = p_invite_code
  LIMIT  1;

  IF v_trip IS NULL THEN
    RETURN json_build_object('error', 'invite_not_found');
  END IF;

  -- If the joining user IS the owner, just return the trip
  IF v_joining_user_id = v_owner_user_id THEN
    RETURN json_build_object(
      'success', true,
      'alreadyOwner', true,
      'tripId',   v_trip->>'id',
      'tripName', v_trip->>'name',
      'trip',     v_trip
    );
  END IF;

  -- Check name conflicts
  SELECT (v_trip->'members') @> to_jsonb(p_member_name) INTO v_member_exists;
  SELECT EXISTS (
    SELECT 1
    FROM   jsonb_array_elements(COALESCE(v_trip->'pendingInvites','[]'::jsonb)) invite
    WHERE  invite->>'name' ILIKE p_member_name
      AND  invite->>'status' = 'Pozvany'
  ) INTO v_has_slot;

  IF v_member_exists AND NOT v_has_slot THEN
    RETURN json_build_object('error', 'name_taken');
  END IF;

  -- Update owner's trip: add member + mark invite accepted
  UPDATE trip_states
  SET    state_json = jsonb_set(
           state_json, '{trips}',
           (
             SELECT jsonb_agg(
               CASE WHEN t->>'inviteCode' = p_invite_code THEN
                 jsonb_set(
                   jsonb_set(
                     t, '{members}',
                     CASE WHEN NOT v_member_exists
                       THEN COALESCE(t->'members','[]'::jsonb) || to_jsonb(p_member_name)
                       ELSE t->'members'
                     END
                   ),
                   '{pendingInvites}',
                   COALESCE(
                     (
                       SELECT jsonb_agg(
                         CASE WHEN invite->>'name' ILIKE p_member_name
                           THEN jsonb_set(invite, '{status}', '"Prijate"')
                           ELSE invite
                         END
                       )
                       FROM jsonb_array_elements(COALESCE(t->'pendingInvites','[]'::jsonb)) invite
                     ),
                     '[]'::jsonb
                   )
                 )
               ELSE t
               END
             )
             FROM jsonb_array_elements(state_json->'trips') t
           )
         )
  WHERE  user_id = v_owner_user_id;

  -- Fetch the updated trip
  SELECT trip_elem.value INTO v_updated_trip
  FROM   trip_states ts,
         jsonb_array_elements(ts.state_json->'trips') trip_elem
  WHERE  ts.user_id = v_owner_user_id
    AND  trip_elem.value->>'inviteCode' = p_invite_code;

  -- Copy trip to joining user
  INSERT INTO trip_states (user_id, state_json)
  VALUES (
    v_joining_user_id,
    jsonb_build_object(
      'trips', jsonb_build_array(v_updated_trip),
      'selectedTripId', v_updated_trip->>'id'
    )
  )
  ON CONFLICT (user_id) DO UPDATE
  SET state_json = jsonb_build_object(
    'trips',
    (
      SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) || jsonb_build_array(v_updated_trip)
      FROM   jsonb_array_elements(COALESCE(trip_states.state_json->'trips','[]'::jsonb)) t
      WHERE  t->>'inviteCode' != p_invite_code
    ),
    'selectedTripId',
    COALESCE(trip_states.state_json->>'selectedTripId', v_updated_trip->>'id')
  );

  RETURN json_build_object(
    'success',    true,
    'tripId',     v_updated_trip->>'id',
    'tripName',   v_updated_trip->>'name',
    'memberName', p_member_name,
    'trip',       v_updated_trip
  );
END;
$$;

GRANT EXECUTE ON FUNCTION join_trip_by_invite_code TO authenticated;


-- 3. Sync trip state to all participants by invite code (requires auth)
--    - Caller must already have this invite code in their own state
--    - Updates matching trip in every user's trip_states copy
CREATE OR REPLACE FUNCTION sync_trip_state_by_invite_code(p_invite_code TEXT, p_trip JSONB)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_rows INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF COALESCE(trim(p_invite_code), '') = '' OR p_trip IS NULL THEN
    RETURN json_build_object('error', 'invalid_payload');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM   trip_states ts,
           jsonb_array_elements(COALESCE(ts.state_json->'trips','[]'::jsonb)) trip_elem
    WHERE  ts.user_id = auth.uid()
      AND  trip_elem.value->>'inviteCode' = p_invite_code
  ) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  UPDATE trip_states ts
  SET    state_json = jsonb_set(
           ts.state_json, '{trips}',
           (
             SELECT jsonb_agg(
               CASE
                 WHEN t->>'inviteCode' = p_invite_code THEN p_trip
                 ELSE t
               END
             )
             FROM jsonb_array_elements(COALESCE(ts.state_json->'trips','[]'::jsonb)) t
           )
         )
  WHERE EXISTS (
    SELECT 1
    FROM   jsonb_array_elements(COALESCE(ts.state_json->'trips','[]'::jsonb)) t
    WHERE  t->>'inviteCode' = p_invite_code
  );

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  RETURN json_build_object(
    'success', true,
    'updatedRows', v_updated_rows
  );
END;
$$;

GRANT EXECUTE ON FUNCTION sync_trip_state_by_invite_code TO authenticated;
