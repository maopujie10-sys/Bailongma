# Plugins - Plugin system for Bailongma
# Hot-reloadable plugin loader with sandbox isolation

import os
import sys
import json
import importlib
import importlib.util
from typing import Optional, Any
from pathlib import Path

class PluginLoader:
    \"\"\"Hot-reloadable plugin loader with sandbox isolation.\"\"\"
    
    def __init__(self, plugin_dir: str = None):
        self.plugin_dir = plugin_dir or os.path.join(os.path.dirname(__file__), "plugins")
        self.loaded = {}
        self.registry = {}
        self._initialized = False
    
    def initialize(self) -> bool:
        os.makedirs(self.plugin_dir, exist_ok=True)
        self._initialized = True
        return True
    
    def discover(self) -> list:
        \"\"\"Discover available plugins in plugin directory.\"\"\"
        plugins = []
        if not os.path.isdir(self.plugin_dir):
            return plugins
        for item in os.listdir(self.plugin_dir):
            plugin_path = os.path.join(self.plugin_dir, item)
            if os.path.isdir(plugin_path):
                manifest = os.path.join(plugin_path, "manifest.json")
                if os.path.exists(manifest):
                    with open(manifest, "r", encoding="utf-8") as f:
                        info = json.load(f)
                    info["path"] = plugin_path
                    plugins.append(info)
        return plugins
    
    def load(self, plugin_name: str) -> dict:
        \"\"\"Load a plugin by name.\"\"\"
        if plugin_name in self.loaded:
            return {"status": "already_loaded", "name": plugin_name}
        
        plugin_path = os.path.join(self.plugin_dir, plugin_name)
        if not os.path.isdir(plugin_path):
            return {"error": f"Plugin '{plugin_name}' not found"}
        
        try:
            init_file = os.path.join(plugin_path, "__init__.py")
            spec = importlib.util.spec_from_file_location(plugin_name, init_file)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            self.loaded[plugin_name] = module
            self.registry[plugin_name] = {
                "module": module,
                "loaded_at": __import__("datetime").datetime.now().isoformat()
            }
            return {"status": "loaded", "name": plugin_name}
        except Exception as e:
            return {"error": str(e), "name": plugin_name}
    
    def unload(self, plugin_name: str) -> dict:
        \"\"\"Unload a plugin.\"\"\"
        if plugin_name in self.loaded:
            del self.loaded[plugin_name]
            del self.registry[plugin_name]
            return {"status": "unloaded", "name": plugin_name}
        return {"error": f"Plugin '{plugin_name}' not loaded"}
    
    def reload(self, plugin_name: str) -> dict:
        \"\"\"Hot-reload a plugin.\"\"\"
        self.unload(plugin_name)
        return self.load(plugin_name)
    
    def get_status(self) -> dict:
        return {
            "initialized": self._initialized,
            "loaded": list(self.loaded.keys()),
            "available": [p["name"] for p in self.discover()]
        }

class PluginSandbox:
    \"\"\"Sandbox for safe plugin execution.\"\"\"
    
    def __init__(self, allowed_modules: list = None):
        self.allowed_modules = allowed_modules or ["json", "re", "datetime", "math"]
    
    def execute(self, code: str, context: dict = None) -> dict:
        \"\"\"Execute code in sandboxed environment.\"\"\"
        safe_globals = {"__builtins__": {}}
        for mod in self.allowed_modules:
            safe_globals[mod] = __import__(mod)
        safe_globals.update(context or {})
        try:
            exec(code, safe_globals)
            return {"status": "ok", "result": safe_globals.get("result", None)}
        except Exception as e:
            return {"error": str(e)}

plugin_loader = PluginLoader()
plugin_sandbox = PluginSandbox()
