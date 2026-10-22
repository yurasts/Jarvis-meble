import { supabase } from '../supabase';

const PRESENCE_COLUMNS = 'user_id,last_seen_at,last_device_type,last_user_agent';
const LOG_COLUMNS = 'id,user_id,user_email,user_name,event_type,device_type,user_agent,created_at';

const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};

export const createUserActivityRepository = ({ client = supabase } = {}) => ({
  async record({ eventType, deviceType, userAgent }) {
    return unwrap(await client.rpc('record_user_activity', {
      p_event_type: eventType,
      p_device_type: deviceType,
      p_user_agent: userAgent || null,
    }));
  },

  async listPresence() {
    return unwrap(await client
      .from('user_presence')
      .select(PRESENCE_COLUMNS)
      .order('last_seen_at', { ascending: false })) || [];
  },

  async listLogs({ limit = 200 } = {}) {
    return unwrap(await client
      .from('user_activity_logs')
      .select(LOG_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(limit)) || [];
  },
});

const userActivityRepository = createUserActivityRepository();

export default userActivityRepository;
