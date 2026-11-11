import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  tsconfig:'./tsconfig.json',
  testDir:'./e2e', fullyParallel:true, retries:0,
  reporter:'list',
  use:{baseURL:'http://127.0.0.1:5310',trace:'retain-on-failure'},
  webServer:{command:'npm start',url:'http://127.0.0.1:5310',reuseExistingServer:!process.env.CI},
  projects:[
    {name:'chromium',use:{...devices['Desktop Chrome']}},
    {name:'webkit-mobile',use:{...devices['iPhone 13']}},
  ],
});
