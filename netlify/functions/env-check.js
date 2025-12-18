exports.handler = async () => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      hasSupabaseUrl: !!process.env.SUPABASE_URL,
      hasServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasSupabaseKeyFallback: !!process.env.SUPABASE_KEY,
    }),
  };
};
