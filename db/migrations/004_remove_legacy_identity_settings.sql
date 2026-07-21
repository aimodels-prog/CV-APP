DELETE FROM users
WHERE LOWER(email) = 'admin@example.com';

DELETE FROM app_settings
WHERE key = 'profile-settings';
