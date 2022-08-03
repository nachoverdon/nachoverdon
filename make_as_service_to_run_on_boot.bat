@echo off
echo Adding slippi_watcher as a service...
sc delete "slippi_watcher"
sc create "slippi_watcher" binPath= "C:\projects\ghprofile\nachoverdon\watcher\dist\watcher-launcher.exe" start= delayed-auto displayname= "slippi_watcher"
sc description "slippi_watcher" "Watches for Slippi replays and updates GitHub profile with the stats from the last game."
sc failure "slippi_watcher" reset= 30000 actions= restart/5000/restart/5000/restart/5000
echo.

pause
