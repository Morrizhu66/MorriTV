# 测试

所有命令在仓库根目录执行。

```bash
node --test tests/test_canvas_ui.cjs
python3 -m unittest tests.test_script_studio tests.test_script_workflows
```

完整 Python 测试发现：`python3 -m unittest discover -s tests`。部分旧测试依赖本地服务、历史接口或特定依赖；运行前先阅读对应测试，不默认调用付费生成接口。
