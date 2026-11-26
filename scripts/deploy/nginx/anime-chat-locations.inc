    location / {
        try_files $uri $uri/ /index.html;
    }

    # Bangumi API 反代：服务器与浏览器都直连不了 api.bgm.tv（DNS 污染 + SNI 阻断）
    # 走 Cloudflare Pages（bgmapi.rainmory.xyz）中转；变量 host + ipv6=off 避免
    # nginx 解析到 AAAA（这台机器没有 IPv6，连 AAAA 会直接 Network unreachable）。
    location /api/bgm/ {
        set $bgm_host "bgmapi.rainmory.xyz";
        rewrite ^/api/bgm(/.*)$ $1 break;
        proxy_pass https://$bgm_host$uri$is_args$args;
        proxy_ssl_server_name on;
        proxy_ssl_name $bgm_host;
        proxy_http_version 1.1;
        proxy_set_header Host $bgm_host;
        proxy_set_header User-Agent "anime-chat/1.0 (https://github.com/Amenoe/anime-chat)";
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_connect_timeout 10s;
        proxy_read_timeout 90s;
        proxy_send_timeout 90s;
        proxy_ignore_client_abort on;
        proxy_ignore_headers Cache-Control Expires Set-Cookie Vary;
        proxy_hide_header Set-Cookie;
        proxy_cache bgm_api_cache;
        proxy_cache_key "$scheme$request_method$host$request_uri";
        proxy_cache_valid 200 10m;
        proxy_cache_background_update on;
        proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
        proxy_cache_lock on;
        add_header X-Bgm-Cache $upstream_cache_status;
    }

    # Bangumi 缩略图：/r/200/pic/... → 回源 /pic/...，缩放到 240 宽再缓存
    location ~ ^/api/bgm-img/r/[0-9]+(/.*)$ {
        set $bgm_host "bgmapi.rainmory.xyz";
        rewrite ^/api/bgm-img(?:/r/[0-9]+)?(/.*)$ $1 break;
        proxy_pass https://$bgm_host$uri$is_args$args;
        proxy_ssl_server_name on;
        proxy_ssl_name $bgm_host;
        proxy_http_version 1.1;
        proxy_set_header Host $bgm_host;
        proxy_set_header User-Agent "anime-chat/1.0 (https://github.com/Amenoe/anime-chat)";
        proxy_connect_timeout 10s;
        proxy_read_timeout 90s;
        proxy_send_timeout 90s;
        proxy_ignore_client_abort on;
        image_filter resize 240 -;
        image_filter_jpeg_quality 80;
        image_filter_buffer 10m;
        image_filter_interlace on;
        proxy_ignore_headers Cache-Control Expires Set-Cookie Vary;
        proxy_hide_header Set-Cookie;
        proxy_cache bgm_img_cache;
        proxy_cache_valid 200 7d;
        proxy_cache_lock on;
        proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
        add_header X-Bgm-Cache $upstream_cache_status;
    }

    # Bangumi 原图：/pic/...（详情页 hero 用），不缩放
    location /api/bgm-img/ {
        set $bgm_host "bgmapi.rainmory.xyz";
        rewrite ^/api/bgm-img(/.*)$ $1 break;
        proxy_pass https://$bgm_host$uri$is_args$args;
        proxy_ssl_server_name on;
        proxy_ssl_name $bgm_host;
        proxy_http_version 1.1;
        proxy_set_header Host $bgm_host;
        proxy_set_header User-Agent "anime-chat/1.0 (https://github.com/Amenoe/anime-chat)";
        proxy_connect_timeout 10s;
        proxy_read_timeout 90s;
        proxy_send_timeout 90s;
        proxy_ignore_client_abort on;
        proxy_ignore_headers Cache-Control Expires Set-Cookie Vary;
        proxy_hide_header Set-Cookie;
        proxy_cache bgm_img_cache;
        proxy_cache_valid 200 7d;
        proxy_cache_lock on;
        proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
        add_header X-Bgm-Cache $upstream_cache_status;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_read_timeout 300s;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
