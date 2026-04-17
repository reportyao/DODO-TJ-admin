#!/usr/bin/expect -f
set timeout 60
spawn scp -o StrictHostKeyChecking=no dist.tar.gz root@47.82.78.182:/tmp/
expect "password:"
send "Lingjiu123@\r"
expect eof
spawn ssh -o StrictHostKeyChecking=no root@47.82.78.182 "mkdir -p /var/www/test.tezbarakat.com/admin/ && mkdir -p /tmp/dodo-admin-dist && rm -rf /tmp/dodo-admin-dist/* && tar xzf /tmp/dist.tar.gz -C /tmp/dodo-admin-dist --strip-components=1 && find /var/www/test.tezbarakat.com/admin/ -maxdepth 1 -type f -delete && find /var/www/test.tezbarakat.com/admin/ -maxdepth 1 -mindepth 1 -type d ! -name assets -exec rm -rf {} + && cp -r /tmp/dodo-admin-dist/* /var/www/test.tezbarakat.com/admin/ && chown -R www-data:www-data /var/www/test.tezbarakat.com/admin/ && chmod -R 755 /var/www/test.tezbarakat.com/admin/ && ls -la /var/www/test.tezbarakat.com/admin/assets/ | tail -3"
expect "password:"
send "Lingjiu123@\r"
expect eof
