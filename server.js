const express = require('express');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const app = express();

// 代理配置
const PROXY_CONFIG = {
    host: '127.0.0.1',
    port: '7890'
};

// 创建 https 代理
const httpsAgent = new HttpsProxyAgent(`http://${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`);

const axiosInstance = axios.create({
    timeout: 120000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    httpsAgent: httpsAgent,
    proxy: false,
    responseType: 'arraybuffer'  // 添加这行来处理二进制响应
});

// 更新后的 NovelAI API 基础 URL
const NOVELAI_BASE_URL = 'https://image.novelai.net';
const NOVELAI_GENERATE_ENDPOINT = '/ai/generate-image';
// 配置中间件来解析 JSON，增加限制
app.use(express.json({limit: '50mb'}));

// 处理所有到 NovelAI API 的请求
app.all('/novelai/*', async (req, res) => {
    try {
        // 增强请求日志
        console.log('\n=== 新请求开始 ===');
        console.log('请求详情:', {
            时间: new Date().toISOString(),
            方法: req.method,
            URL: req.url,
            请求头: req.headers,
            请求体大小: req.body ? JSON.stringify(req.body).length : 0,
        });

        // 构建请求配置
        const config = {
            method: req.method,
            url: `${NOVELAI_BASE_URL}${NOVELAI_GENERATE_ENDPOINT}`,
            headers: {
                ...req.headers,
                'host': 'image.novelai.net',
                'accept': '*/*',
                'accept-encoding': 'gzip, deflate, br'
            },
            data: req.body,
            responseType: 'arraybuffer',  // 确保响应类型为 arraybuffer
            validateStatus: function (status) {
                return true; // 接受所有状态码
            }
        };

        // 删除不需要的请求头
        delete config.headers['content-length'];
        delete config.headers['host'];
        delete config.headers['connection'];


        console.log('准备发送请求到 NovelAI:', {
            目标URL: config.url,
            请求方法: config.method,
            请求头: config.headers
        });

        const response = await axiosInstance(config);

        // 增强响应日志
        console.log('收到 NovelAI 响应:', {
            状态码: response.status,
            响应头: response.headers,
            响应体大小: response.data.length,
            响应类型: response.headers['content-type']
        });

        // 设置响应头
        res.set({
            'Content-Type': response.headers['content-type'] || 'application/octet-stream',
            'Content-Length': response.data.length
        });

        // 如果状态码不是成功的范围
        if (response.status >= 400) {
            const errorMessage = response.data.toString();
            console.error('NovelAI API 错误响应:', {
                状态码: response.status,
                错误信息: errorMessage,
                请求URL: config.url,
                请求方法: config.method
            });
            return res.status(response.status).send(errorMessage);
        }

        // 记录成功响应
        console.log('请求处理成功，正在发送响应给客户端');
        res.status(response.status).send(response.data);
        console.log('=== 请求结束 ===\n');

    } catch (error) {
        console.error('代理请求发生错误:', {
            时间: new Date().toISOString(),
            错误消息: error.message,
            错误代码: error.code,
            错误栈: error.stack,
            请求URL: req.url,
            请求方法: req.method,
            响应信息: error.response ? {
                状态码: error.response.status,
                响应头: error.response.headers,
                响应数据: error.response.data ? error.response.data.toString() : null
            } : '无响应信息'
        });

        if (error.response) {
            // 如果有错误响应，转发错误信息
            res.status(error.response.status).send(error.response.data);
        } else {
            // 其他错误
            res.status(500).json({
                error: '代理服务器错误',
                message: error.message
            });
        }
    }
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`代理服务器运行在端口 ${PORT}`);
    console.log(`代理目标: ${NOVELAI_BASE_URL}`);
});