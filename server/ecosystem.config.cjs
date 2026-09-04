module.exports = {
  apps: [
    {
      name: "sales-api",

      cwd: "/var/www/ai-agent-saas/server",
      script: "./dist/index.js",

      interpreter: "node",
      node_args: "--env-file=/var/www/ai-agent-saas/server/.env",

      instances: 1,
      exec_mode: "fork",

      env: {
        NODE_ENV: "production",
        PORT: "4400",
        API_PORT: "4400"
      },

      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      restart_delay: 3000,
      exp_backoff_restart_delay: 100,

      error_file: "/var/www/ai-agent-saas/server/logs/api-error.log",
      out_file: "/var/www/ai-agent-saas/server/logs/api-out.log",
      merge_logs: true,
      time: true
    },

    {
      name: "sales-worker",

      cwd: "/var/www/ai-agent-saas/server",
      script: "./dist/workers/index.js",

      interpreter: "node",
      node_args: "--env-file=/var/www/ai-agent-saas/server/.env",

      instances: 1,
      exec_mode: "fork",

      env: {
        NODE_ENV: "production"
      },

      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      restart_delay: 3000,
      exp_backoff_restart_delay: 100,

      error_file: "/var/www/ai-agent-saas/server/logs/worker-error.log",
      out_file: "/var/www/ai-agent-saas/server/logs/worker-out.log",
      merge_logs: true,
      time: true
    }
  ]
};
