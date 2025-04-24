const config = {
  development: {
    redirectUri: 'http://localhost:3000/onedriveapp',
    teamsCallbackUri: 'http://localhost:3000/teams/auth/callback',
    onedriveUri: 'http://localhost:3000/onedriveapp',
    clientId: 'e03ab8e9-4eb4-4bbc-8c6d-805021e089cd',
    authority: 'https://login.microsoftonline.com/899fa835-174e-49e1-93a3-292318f5ee84'
  },
  production: {
    redirectUri: 'https://onedriveapp.onrender.com',
    clientId: 'e03ab8e9-4eb4-4bbc-8c6d-805021e089cd',
    authority: 'https://login.microsoftonline.com/899fa835-174e-49e1-93a3-292318f5ee84'
  }
};

// Set environment based on NODE_ENV or default to development
const environment = process.env.NODE_ENV || 'development';
module.exports = config[environment]; 