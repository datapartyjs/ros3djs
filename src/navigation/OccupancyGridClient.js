import { EventEmitter2 } from '../../shims/eventemitter2/EventEmitter2.js';
import THREE from '../../shims/three/core.js';
import ROSLIB from '../../shims/roslib/ROSLIB.js';

import { OccupancyGrid } from './OccupancyGrid.js';
import { SceneNode } from '../visualization/SceneNode.js';

/**
 * @author Russell Toris - rctoris@wpi.edu
 */

export class OccupancyGridClient extends EventEmitter2 {

  /**
   * An occupancy grid client that listens to a given map topic.
   *
   * Emits the following events:
   *
   *  * 'change' - there was an update or change in the marker
   *
   * @constructor
   * @param options - object with following keys:
   *
   *   * ros - the ROSLIB.Ros connection handle
   *   * topic (optional) - the map topic to listen to
   *   * continuous (optional) - if the map should be continuously loaded (e.g., for SLAM)
   *   * tfClient (optional) - the TF client handle to use for a scene node
   *   * compression (optional) - message compression (default: 'cbor')
   *   * rootObject (optional) - the root object to add this marker to
   *   * offsetPose (optional) - offset pose of the grid visualization, e.g. for z-offset (ROSLIB.Pose type)
   *   * color (optional) - color of the visualized grid
   *   * opacity (optional) - opacity of the visualized grid (0.0 == fully transparent, 1.0 == opaque)
   */
  constructor(options) {
    super();
    options = options || {};
    this.ros = options.ros;
    this.topicName = options.topic || '/map';
    this.compression = options.compression || 'cbor';
    this.continuous = options.continuous;
    this.tfClient = options.tfClient;
    this.rootObject = options.rootObject || new THREE.Object3D();
    this.offsetPose = options.offsetPose || new ROSLIB.Pose();
    this.color = options.color || {r:255,g:255,b:255};
    this.opacity = options.opacity || 1.0;

    // current grid that is displayed
    this.currentGrid = null;

    // subscribe to the topic
    this.rosTopic = undefined;
    this.subscribe();
  };

  unsubscribe(){
    if(this.rosTopic){
      this.rosTopic.unsubscribe();
    }
  };

  subscribe(){
    this.unsubscribe();

    // subscribe to the topic
    this.rosTopic = new ROSLIB.Topic({
      ros : this.ros,
      name : this.topicName,
      messageType : 'nav_msgs/OccupancyGrid',
      queue_length : 1,
      compression : this.compression
    });
    this.sceneNode = null;
    this.rosTopic.subscribe(this.processMessage.bind(this));
  };

  processMessage(message){
    // check for an old map
    if (this.currentGrid) {
      // check if it there is a tf client
      if (this.currentGrid.tfClient) {
        // grid is of type ROS3D.SceneNode
        this.currentGrid.unsubscribeTf();
      }
      this.sceneNode.remove(this.currentGrid);
      this.currentGrid.dispose();
    }

    var newGrid = new OccupancyGrid({
      message : message,
      color : this.color,
      opacity : this.opacity
    });

    // check if we care about the scene
    if (this.tfClient) {
      this.currentGrid = newGrid;
      if (this.sceneNode === null) {
        this.sceneNode = new SceneNode({
          frameID : message.header.frame_id,
          tfClient : this.tfClient,
          object : newGrid,
          pose : this.offsetPose
        });
        this.rootObject.add(this.sceneNode);
      } else {
        this.sceneNode.add(this.currentGrid);
      }
    } else {
      this.sceneNode = this.currentGrid = newGrid;
      this.rootObject.add(this.currentGrid);
    }

    this.emit('change');

    // check if we should unsubscribe
    if (!this.continuous) {
      this.rosTopic.unsubscribe();
    }
  };
}
