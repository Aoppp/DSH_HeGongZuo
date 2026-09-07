-- 使用平台统一的简短显示名，不影响企业微信账号 ID 与历史打卡关联。
UPDATE employees
SET display_name = 'Rakesh', updated_at = now()
WHERE display_name = 'KADALIPURA PUTTASWAMY RAKESH';

UPDATE employees
SET display_name = 'Peter', updated_at = now()
WHERE display_name = 'MONDAY PETER AJISAFE';
