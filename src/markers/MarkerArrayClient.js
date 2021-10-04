import THREE from '../shims/three/core.js';
import { EventEmitter2 } from '../shims/eventemitter2/EventEmitter2.js';
import ROSLIB from '../shims/roslib/ROSLIB.js';

import { Marker } from './Marker.js';
import { SceneNode } from '../visualization/SceneNode.js';

/**
 * @author Russell Toris - rctoris@wpi.edu
 * @author Nils Berg - berg.nils@gmail.com
 */

export class MarkerArrayClient extends EventEmitter2 {

  /**
   * A MarkerArray client that listens to a given topic.
   *
   * Emits the following events:
   *
   *  * 'change' - there was an update or change in the MarkerArray
   *
   * @constructor
   * @param options - object with following keys:
   *
   *   * ros - the ROSLIB.Ros connection handle
   *   * topic - the marker topic to listen to
   *   * tfClient - the TF client handle to use
   *   * rootObject (optional) - the root object to add the markers to
   *   * path (optional) - the base path to any meshes that will be loaded
   */
  constructor(options) {
    super();
    options = options || {};
    this.ros = options.ros;
    this.topicName = options.topic;
    this.tfClient = options.tfClient;
    this.rootObject = options.rootObject || new THREE.Object3D();
    this.path = options.path || '/';

    // Markers that are displayed (Map ns+id--Marker)
    this.markers = {};
    this.rosTopic = undefined;

    this.subscribe();
  };

  subscribe(){
    this.unsubscribe();

    // subscribe to MarkerArray topic
    this.rosTopic = new ROSLIB.Topic({
      ros : this.ros,
      name : this.topicName,
      messageType : 'visualization_msgs/MarkerArray',
      compression : 'png'
    });
    this.rosTopic.subscribe(this.processMessage.bind(this));
  };

  processMessage(arrayMessage){
    arrayMessage.markers.forEach(function(message) {
      if(message.action === 0) {
        var updated = false;
        if(message.ns + message.id in this.markers) { // "MODIFY"
          updated = this.markers[message.ns + message.id].children[0].update(message);
          if(!updated) { // "REMOVE"
            this.removeMarker(message.ns + message.id);
          }
        }
        if(!updated) { // "ADD"
          var newMarker = new Marker({
            message : message,
            path : this.path,
          });
          this.markers[message.ns + message.id] = new SceneNode({
            frameID : message.header.frame_id,
            tfClient : this.tfClient,
            object : newMarker
          });
          this.rootObject.add(this.markers[message.ns + message.id]);
        }
      }
      else if(message.action === 1) { // "DEPRECATED"
        console.warn('Received marker message with deprecated action identifier "1"');
      }
      else if(message.action === 2) { // "DELETE"
        this.removeMarker(message.ns + message.id);
      }
      else if(message.action === 3) { // "DELETE ALL"
        for (var m in this.markers){
          this.removeMarker(m);
        }
        this.markers = {};
      }
      else {
        console.warn('Received marker message with unknown action identifier "'+message.action+'"');
      }
    }.bind(this));

    this.emit('change');
  };

  unsubscribe(){
    if(this.rosTopic){
      this.rosTopic.unsubscribe();
    }
  };

  removeMarker(key) {
    var oldNode = this.markers[key];
    if(!oldNode) {
      return;
    }
    oldNode.unsubscribeTf();
    this.rootObject.remove(oldNode);
    oldNode.children.forEach(child => {
      child.dispose();
    });
    delete(this.markers[key]);
  };
}
